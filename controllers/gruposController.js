const pool = require('../config/db')
const { crearNotificacion } = require('./notificacionesController')
const { getIO } = require('../socket') // ✔ Import correcto

/* ============================================================
   OBTENER TODOS LOS GRUPOS
============================================================ */
const getGrupos = async (req, res) => {
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT g.*, u.nombre as creador_nombre,
      COUNT(DISTINCT gm.usuario_id) as miembros,
      MAX(CASE WHEN gm2.usuario_id = $1 THEN 1 ELSE 0 END) as es_miembro
      FROM grupos g
      LEFT JOIN usuarios u ON g.creador_id = u.id
      LEFT JOIN grupo_miembros gm ON g.id = gm.grupo_id
      LEFT JOIN grupo_miembros gm2 ON g.id = gm2.grupo_id AND gm2.usuario_id = $1
      GROUP BY g.id, u.nombre
      ORDER BY g.creado_at DESC
    `, [usuario_id])

    res.json(result.rows)

  } catch (err) {
    console.log('ERROR GET GRUPOS:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   CREAR GRUPO
============================================================ */
const crearGrupo = async (req, res) => {
  const { nombre, descripcion, categoria } = req.body
  const creador_id = req.usuario.id

  try {
    const result = await pool.query(
      `INSERT INTO grupos (nombre, descripcion, categoria, creador_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, descripcion || '', categoria || 'General', creador_id]
    )

    await pool.query(
      `INSERT INTO grupo_miembros (grupo_id, usuario_id, rol)
       VALUES ($1, $2, 'admin')`,
      [result.rows[0].id, creador_id]
    )

    const grupo = {
      ...result.rows[0],
      miembros: 1,
      es_miembro: 1
    }

    // 🔥 Realtime
    const io = getIO()
    io.emit('grupo_creado', grupo)

    res.json(grupo)

  } catch (err) {
    console.log('ERROR CREAR GRUPO:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ACTUALIZAR GRUPO
============================================================ */
const actualizarGrupo = async (req, res) => {
  const { id } = req.params
  const { descripcion, nombre } = req.body
  const usuario_id = req.usuario.id

  try {
    const grupo = await pool.query('SELECT * FROM grupos WHERE id = $1', [id])

    if (grupo.rows.length === 0)
      return res.status(404).json({ error: 'Grupo no encontrado' })

    if (grupo.rows[0].creador_id !== parseInt(usuario_id))
      return res.status(403).json({ error: 'No autorizado' })

    await pool.query(
      `UPDATE grupos 
       SET descripcion = COALESCE($1, descripcion),
           nombre = COALESCE($2, nombre)
       WHERE id = $3`,
      [descripcion, nombre, id]
    )

    // 🔥 Realtime
    const io = getIO()
    io.emit('grupo_actualizado', {
      id,
      nombre,
      descripcion
    })

    res.json({ message: 'Grupo actualizado' })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   UNIRSE A GRUPO
============================================================ */
const unirseGrupo = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    const existe = await pool.query(
      `SELECT * FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    )

    if (existe.rows.length > 0)
      return res.status(400).json({ error: 'Ya eres miembro' })

    await pool.query(
      `INSERT INTO grupo_miembros (grupo_id, usuario_id)
       VALUES ($1, $2)`,
      [id, usuario_id]
    )

    const count = await pool.query(
      `SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = $1`,
      [id]
    )

    // 🔥 Realtime: contador para todos + aviso personal a quien se unió
    // (así Grupos.jsx puede actualizar "Unido"/"Unirse" sin recargar)
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_actualizado', {
      id: Number(id),
      miembros: parseInt(count.rows[0].count)
    })
    io.to(`user_${usuario_id}`).emit('mi_membresia_grupo', {
      grupo_id: Number(id),
      es_miembro: 1
    })

    res.json({
      message: 'Te uniste al grupo',
      miembros: parseInt(count.rows[0].count)
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   SALIR DEL GRUPO
============================================================ */
const salirGrupo = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    // 🔒 Si es admin y hay más gente en el grupo, no puede salir así
    // nomás: primero debe transferirle la administración a alguien más
    const yo = await pool.query(
      `SELECT rol FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    )

    if ((yo.rows[0]?.rol || '').toString().trim().toLowerCase() === 'admin') {
      const otros = await pool.query(
        `SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id != $2`,
        [id, usuario_id]
      )
      if (parseInt(otros.rows[0].count) > 0) {
        return res.status(400).json({
          error: 'Eres el administrador. Dale la administración a otra persona antes de salir'
        })
      }
      // Si es admin y está solo en el grupo, sí puede salir sin problema
    }

    await pool.query(
      `DELETE FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    )

    const count = await pool.query(
      `SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = $1`,
      [id]
    )

    // 🔥 Realtime: contador para todos + aviso personal a quien salió
    // (así Grupos.jsx se actualiza solo, sin necesidad de recargar)
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_actualizado', {
      id: Number(id),
      miembros: parseInt(count.rows[0].count)
    })
    io.to(`user_${usuario_id}`).emit('mi_membresia_grupo', {
      grupo_id: Number(id),
      es_miembro: 0
    })

    res.json({
      message: 'Saliste del grupo',
      miembros: parseInt(count.rows[0].count)
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   TRANSFERIR ADMINISTRACIÓN (solo el admin actual puede hacerlo)
============================================================ */
const transferirAdmin = async (req, res) => {
  const { id, usuarioId } = req.params
  const solicitante_id = req.usuario.id

  try {
    const solicitante = await pool.query(
      `SELECT rol FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, solicitante_id]
    )

    const rolSolicitante = (solicitante.rows[0]?.rol || '').toString().trim().toLowerCase()
    if (solicitante.rows.length === 0 || rolSolicitante !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede transferir el rol' })
    }

    if (parseInt(usuarioId) === solicitante_id) {
      return res.status(400).json({ error: 'Ya eres el administrador' })
    }

    const nuevo = await pool.query(
      `SELECT * FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuarioId]
    )

    if (nuevo.rows.length === 0) {
      return res.status(404).json({ error: 'Ese usuario no pertenece al grupo' })
    }

    await pool.query(
      `UPDATE grupo_miembros SET rol = 'miembro' WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, solicitante_id]
    )
    await pool.query(
      `UPDATE grupo_miembros SET rol = 'admin' WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuarioId]
    )

    // 🔥 Realtime: avisar al grupo que hay nuevo admin
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_admin_transferido', {
      grupo_id: Number(id),
      nuevo_admin_id: Number(usuarioId)
    })

    res.json({ message: 'Administración transferida', nuevo_admin_id: Number(usuarioId) })

  } catch (err) {
    console.log('ERROR TRANSFERIR ADMIN:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER MIEMBROS DEL GRUPO
============================================================ */
const getMiembros = async (req, res) => {
  const { id } = req.params

  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.avatar, gm.rol, gm.unido_at
      FROM grupo_miembros gm
      JOIN usuarios u ON gm.usuario_id = u.id
      WHERE gm.grupo_id = $1
      ORDER BY gm.rol DESC, gm.unido_at ASC
    `, [id])

    res.json(result.rows)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   INVITAR AMIGO AL GRUPO
============================================================ */
const invitarAlGrupo = async (req, res) => {
  const { id } = req.params
  const { usuario_id: invitado_id } = req.body
  const invitador_id = req.usuario.id

  try {
    const esMiembro = await pool.query(
      `SELECT * FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, invitador_id]
    )

    if (esMiembro.rows.length === 0)
      return res.status(403).json({ error: 'No eres miembro del grupo' })

    const yaEsMiembro = await pool.query(
      `SELECT * FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, invitado_id]
    )

    if (yaEsMiembro.rows.length > 0)
      return res.status(400).json({ error: 'Ya es miembro del grupo' })

    await pool.query(
      `INSERT INTO grupo_miembros (grupo_id, usuario_id)
       VALUES ($1, $2)`,
      [id, invitado_id]
    )

    const grupo = await pool.query(
      `SELECT nombre FROM grupos WHERE id = $1`,
      [id]
    )

    await crearNotificacion(
      invitado_id,
      invitador_id,
      'invitacion',
      `te invitó al grupo "${grupo.rows[0]?.nombre}"`,
      { grupo_id: id }
    )

    const countInv = await pool.query(
      `SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = $1`,
      [id]
    )

    // 🔥 Realtime
    const io = getIO()
    io.to(`user_${invitado_id}`).emit('grupo_invitacion', {
      grupo_id: id,
      invitado_id,
      invitador_id,
      grupo_nombre: grupo.rows[0]?.nombre
    })
    io.to(`grupo_${id}`).emit('grupo_actualizado', {
      id: Number(id),
      miembros: parseInt(countInv.rows[0].count)
    })
    io.to(`user_${invitado_id}`).emit('mi_membresia_grupo', {
      grupo_id: Number(id),
      es_miembro: 1
    })

    res.json({ message: 'Invitación enviada' })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   PUBLICACIONES DEL GRUPO
============================================================ */
const getPublicacionesGrupo = async (req, res) => {
  const { id } = req.params

  try {
    const result = await pool.query(`
      SELECT p.*, u.nombre, u.avatar
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.grupo_id = $1
      ORDER BY p.creado_at DESC
    `, [id])

    res.json(result.rows)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   CREAR PUBLICACIÓN EN GRUPO
============================================================ */
const crearPublicacionGrupo = async (req, res) => {
  const { id } = req.params
  const { contenido, imagen_url, video_url, tipo } = req.body
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(
      `INSERT INTO publicaciones (usuario_id, contenido, imagen_url, video_url, tipo, grupo_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [usuario_id, contenido, imagen_url || null, video_url || null, tipo || 'texto', id]
    )

    const pub = await pool.query(`
      SELECT p.*, u.nombre, u.avatar
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = $1
    `, [result.rows[0].id])

    const nuevaPub = pub.rows[0]

    // 🔥 Realtime
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_publicacion', nuevaPub)

    res.json(nuevaPub)

  } catch (err) {
    console.log('ERROR PUB GRUPO:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ELIMINAR PUBLICACIÓN DEL GRUPO
============================================================ */
const eliminarPublicacionGrupo = async (req, res) => {
  const { id, pubId } = req.params
  const usuario_id = req.usuario.id

  try {
    const pub = await pool.query(
      `SELECT usuario_id FROM publicaciones WHERE id = $1 AND grupo_id = $2`,
      [pubId, id]
    )

    if (pub.rows.length === 0)
      return res.status(404).json({ error: 'Publicación no encontrada' })

    const esDueño = pub.rows[0].usuario_id === usuario_id

    const miembro = await pool.query(
      `SELECT rol FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    )
    const esAdmin = (miembro.rows[0]?.rol || '').toString().trim().toLowerCase() === 'admin'

    // 🔒 Solo el dueño de la publicación O el admin del grupo pueden borrarla
    if (!esDueño && !esAdmin) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    await pool.query('DELETE FROM publicaciones WHERE id = $1', [pubId])

    // 🔥 Realtime
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_publicacion_eliminada', {
      grupo_id: id,
      publicacion_id: pubId
    })

    res.json({ message: 'Publicación eliminada' })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   EXPULSAR INTEGRANTE (solo admin)
============================================================ */
const eliminarMiembro = async (req, res) => {
  const { id, usuarioId } = req.params
  const solicitante_id = req.usuario.id

  try {
    const solicitante = await pool.query(
      `SELECT rol FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, solicitante_id]
    )

    const rolSolicitante = (solicitante.rows[0]?.rol || '').toString().trim().toLowerCase()
    if (solicitante.rows.length === 0 || rolSolicitante !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede eliminar integrantes' })
    }

    if (parseInt(usuarioId) === solicitante_id) {
      return res.status(400).json({ error: 'No puedes expulsarte a ti mismo, usa "Salir del grupo"' })
    }

    await pool.query(
      `DELETE FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuarioId]
    )

    const count = await pool.query(
      `SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = $1`,
      [id]
    )

    // 🔥 Realtime: avisar al grupo (y al expulsado en particular)
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_miembro_eliminado', {
      grupo_id: Number(id),
      usuario_id: Number(usuarioId)
    })

    res.json({
      message: 'Integrante eliminado',
      miembros: parseInt(count.rows[0].count)
    })

  } catch (err) {
    console.log('ERROR ELIMINAR MIEMBRO:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ELIMINAR GRUPO (solo el admin, borra todo permanentemente)
============================================================ */
const eliminarGrupo = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    const miembro = await pool.query(
      `SELECT rol FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    )

    const rol = (miembro.rows[0]?.rol || '').toString().trim().toLowerCase()
    if (miembro.rows.length === 0 || rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede eliminar el grupo' })
    }

    // Borrar publicaciones del grupo primero (por si no hay ON DELETE
    // CASCADE configurado en esa relación), esto arrastra también sus
    // reacciones, comentarios y compartidos
    await pool.query('DELETE FROM publicaciones WHERE grupo_id = $1', [id])
    await pool.query('DELETE FROM grupo_miembros WHERE grupo_id = $1', [id])
    await pool.query('DELETE FROM notificaciones WHERE grupo_id = $1', [id])
    await pool.query('DELETE FROM grupos WHERE id = $1', [id])

    // 🔥 Realtime: avisar a todos los que estaban viendo el grupo
    const io = getIO()
    io.to(`grupo_${id}`).emit('grupo_eliminado', { grupo_id: Number(id) })

    res.json({ message: 'Grupo eliminado' })

  } catch (err) {
    console.log('ERROR ELIMINAR GRUPO:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getGrupos,
  crearGrupo,
  actualizarGrupo,
  unirseGrupo,
  salirGrupo,
  transferirAdmin,
  eliminarGrupo,
  getMiembros,
  eliminarMiembro,
  invitarAlGrupo,
  getPublicacionesGrupo,
  crearPublicacionGrupo,
  eliminarPublicacionGrupo
}
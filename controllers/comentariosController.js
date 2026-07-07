const pool = require('../config/db')
const { crearNotificacion } = require('./notificacionesController')
const { getIO } = require('../socket') // ✔ Import correcto

/* ============================================================
   COMENTAR
============================================================ */
const comentar = async (req, res) => {
  const { publicacion_id, contenido } = req.body
  const usuario_id = req.usuario.id

  try {
    if (!contenido || !contenido.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' })
    }

    // Crear comentario
    const result = await pool.query(
      `INSERT INTO comentarios (usuario_id, publicacion_id, contenido)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [usuario_id, publicacion_id, contenido.trim()]
    )

    const comentario = result.rows[0]

    // Obtener datos del usuario
    const userData = await pool.query(
      `SELECT nombre, avatar FROM usuarios WHERE id = $1`,
      [usuario_id]
    )

    const usuario = userData.rows[0]

    // Obtener dueño de la publicación
    const pub = await pool.query(
      'SELECT usuario_id FROM publicaciones WHERE id = $1',
      [publicacion_id]
    )

    const autorPublicacion = pub.rows[0]?.usuario_id

    // 🔥 Crear notificación SOLO si no comentas tu propia publicación
    if (autorPublicacion && autorPublicacion !== usuario_id) {
      await crearNotificacion(
        autorPublicacion,
        usuario_id,
        'comentario',
        'comentó tu publicación 💬',
        { publicacion_id }
      )
    }

    const comentarioCompleto = {
      id: comentario.id,
      usuario_id,
      nombre: usuario.nombre,
      avatar: usuario.avatar,
      contenido: comentario.contenido,
      creado_at: comentario.creado_at,
      publicacion_id
    }

    // 🔥 Realtime: enviar comentario a todos los que tengan el modal abierto
    const io = getIO() // ✔ Aquí sí funciona
    io.emit('comentario_nuevo', comentarioCompleto)

    // 🔥 Realtime: avisar al feed que el contador de comentarios de este post cambió
    const totalComentarios = await pool.query(
      'SELECT COUNT(*) FROM comentarios WHERE publicacion_id = $1',
      [publicacion_id]
    )
    io.emit('publicacion_actualizada', {
      id: Number(publicacion_id),
      comentarios_count: totalComentarios.rows[0].count
    })

    res.json(comentarioCompleto)

  } catch (err) {
    console.log('ERROR COMENTAR:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER COMENTARIOS
============================================================ */
const getComentarios = async (req, res) => {
  const { publicacion_id } = req.params

  try {
    const result = await pool.query(
      `SELECT 
        c.id,
        c.usuario_id,
        c.publicacion_id,
        c.contenido,
        c.creado_at,
        u.nombre,
        u.avatar
       FROM comentarios c
       JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.publicacion_id = $1
       ORDER BY c.creado_at ASC`,
      [publicacion_id]
    )

    res.json(result.rows)

  } catch (err) {
    console.log('ERROR GET COMENTARIOS:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ELIMINAR COMENTARIO
============================================================ */
const eliminarComentario = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(
      'DELETE FROM comentarios WHERE id = $1 AND usuario_id = $2 RETURNING *',
      [id, usuario_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comentario no encontrado o no autorizado' })
    }

    const publicacion_id = result.rows[0].publicacion_id

    // 🔥 Realtime: eliminar comentario
    const io = getIO() // ✔ Aquí también
    io.emit('comentario_eliminado', {
      id,
      usuario_id
    })

    // 🔥 Realtime: avisar al feed que el contador de comentarios bajó
    const totalComentarios = await pool.query(
      'SELECT COUNT(*) FROM comentarios WHERE publicacion_id = $1',
      [publicacion_id]
    )
    io.emit('publicacion_actualizada', {
      id: Number(publicacion_id),
      comentarios_count: totalComentarios.rows[0].count
    })

    res.json({ message: 'Comentario eliminado' })

  } catch (err) {
    console.log('ERROR ELIMINAR COMENTARIO:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { comentar, getComentarios, eliminarComentario }
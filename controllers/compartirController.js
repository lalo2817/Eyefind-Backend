const pool = require('../config/db')
const { crearNotificacion } = require('./notificacionesController')
const { getIO } = require('../socket') // ✔ Import correcto

/* ============================================================
   COMPARTIR POR MENSAJE PRIVADO
============================================================ */
const compartirPorMensaje = async (req, res) => {
  const { publicacion_id, receptor_id } = req.body
  const emisor_id = req.usuario.id

  try {
    // Validar que la publicación existe
    const pub = await pool.query(
      `SELECT usuario_id, grupo_id FROM publicaciones WHERE id = $1`,
      [publicacion_id]
    )

    if (pub.rows.length === 0)
      return res.status(404).json({ error: 'Publicación no encontrada' })

    // 🔒 Las publicaciones de un grupo se quedan en el grupo, no se
    // pueden compartir por mensaje ni a ningún otro lado
    if (pub.rows[0].grupo_id) {
      return res.status(403).json({ error: 'Esta publicación pertenece a un grupo y no se puede compartir fuera de él' })
    }

    const autorPublicacion = pub.rows[0].usuario_id

    // Registrar compartido
    await pool.query(
      `INSERT INTO compartidos (usuario_id, publicacion_id, tipo)
       VALUES ($1, $2, 'mensaje')`,
      [emisor_id, publicacion_id]
    )

    // Crear mensaje con la publicación adjunta
    const mensaje = await pool.query(
      `INSERT INTO mensajes (emisor_id, receptor_id, contenido, publicacion_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [emisor_id, receptor_id, 'Compartió una publicación contigo', publicacion_id]
    )

    const mensajeFinal = mensaje.rows[0]

    // 🔥 Notificación al receptor del mensaje
    await crearNotificacion(
      receptor_id,
      emisor_id,
      'compartido',
      'te compartió una publicación por mensaje 🔁',
      { publicacion_id }
    )

    // 🔥 Notificación al dueño de la publicación (si no es el mismo)
    if (autorPublicacion !== emisor_id) {
      await crearNotificacion(
        autorPublicacion,
        emisor_id,
        'compartido',
        'compartió tu publicación 🔁',
        { publicacion_id }
      )
    }

    // 🔥 Realtime: enviar evento al receptor
    const io = getIO() // ✔ Aquí sí funciona
    io.to(`user_${receptor_id}`).emit('compartido_mensaje', {
      publicacion_id,
      emisor_id,
      receptor_id,
      mensaje: mensajeFinal
    })

    res.json({
      message: 'Publicación compartida por mensaje',
      mensaje: mensajeFinal
    })

  } catch (err) {
    console.log('ERROR COMPARTIR MENSAJE:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   COMPARTIR EN GRUPO
============================================================ */
const compartirEnGrupo = async (req, res) => {
  const { publicacion_id, grupo_id } = req.body
  const usuario_id = req.usuario.id

  try {
    // Validar publicación
    const pub = await pool.query(
      `SELECT usuario_id, grupo_id FROM publicaciones WHERE id = $1`,
      [publicacion_id]
    )

    if (pub.rows.length === 0)
      return res.status(404).json({ error: 'Publicación no encontrada' })

    // 🔒 Una publicación que ya pertenece a un grupo no se puede volver
    // a compartir hacia otro lado (ni siquiera a otro grupo)
    if (pub.rows[0].grupo_id) {
      return res.status(403).json({ error: 'Esta publicación pertenece a un grupo y no se puede compartir fuera de él' })
    }

    const autorPublicacion = pub.rows[0].usuario_id

    // Validar que el usuario es miembro del grupo
    const miembro = await pool.query(
      `SELECT * FROM grupo_miembros WHERE grupo_id = $1 AND usuario_id = $2`,
      [grupo_id, usuario_id]
    )

    if (miembro.rows.length === 0)
      return res.status(403).json({ error: 'No eres miembro del grupo' })

    // Registrar compartido
    await pool.query(
      `INSERT INTO compartidos (usuario_id, publicacion_id, tipo, grupo_id)
       VALUES ($1, $2, 'grupo', $3)`,
      [usuario_id, publicacion_id, grupo_id]
    )

    // Crear mensaje en el grupo
    const mensajeGrupo = await pool.query(
      `INSERT INTO grupo_mensajes (grupo_id, usuario_id, contenido, publicacion_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [grupo_id, usuario_id, 'Compartió una publicación en el grupo', publicacion_id]
    )

    const mensajeFinal = mensajeGrupo.rows[0]

    // 🔥 Notificación al dueño de la publicación (si no es el mismo)
    if (autorPublicacion !== usuario_id) {
      await crearNotificacion(
        autorPublicacion,
        usuario_id,
        'compartido',
        'compartió tu publicación en un grupo 🔁',
        { publicacion_id }
      )
    }

    // 🔥 Realtime: enviar evento a todos los miembros del grupo
    const io = getIO() // ✔ Aquí también
    io.to(`grupo_${grupo_id}`).emit('compartido_grupo', {
      publicacion_id,
      grupo_id,
      usuario_id,
      mensaje: mensajeFinal
    })

    res.json({
      message: 'Publicación compartida en el grupo',
      mensaje: mensajeFinal
    })

  } catch (err) {
    console.log('ERROR COMPARTIR GRUPO:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER COMPARTIDOS DE UNA PUBLICACIÓN
============================================================ */
const getCompartidos = async (req, res) => {
  const { publicacion_id } = req.params

  try {
    const result = await pool.query(
      `SELECT c.*, u.nombre, u.avatar
       FROM compartidos c
       JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.publicacion_id = $1
       ORDER BY c.creado_at DESC`,
      [publicacion_id]
    )

    res.json(result.rows)

  } catch (err) {
    console.log('ERROR GET COMPARTIDOS:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  compartirPorMensaje,
  compartirEnGrupo,
  getCompartidos
}
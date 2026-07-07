const pool = require('../config/db')
const { getIO } = require('../socket') // ✔ Import correcto

/* ============================================================
   ENVIAR MENSAJE
============================================================ */
const enviarMensaje = async (req, res) => {
  const { receptor_id, contenido, imagen_url, publicacion_id } = req.body
  const emisor_id = req.usuario.id

  try {
    // Validar contenido vacío
    if (!contenido && !imagen_url && !publicacion_id) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' })
    }

    const result = await pool.query(
      `INSERT INTO mensajes (emisor_id, receptor_id, contenido, imagen_url, publicacion_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [emisor_id, receptor_id, contenido || null, imagen_url || null, publicacion_id || null]
    )

    const mensaje = result.rows[0]

    // Obtener datos del emisor
    const userData = await pool.query(
      `SELECT nombre, avatar FROM usuarios WHERE id = $1`,
      [emisor_id]
    )

    const usuario = userData.rows[0]

    const mensajeCompleto = {
      ...mensaje,
      nombre_emisor: usuario.nombre,
      avatar_emisor: usuario.avatar
    }

    // 🔥 Realtime: enviar mensaje al receptor
    const io = getIO()
    io.to(`user_${receptor_id}`).emit('nuevo_mensaje', mensajeCompleto)

    res.json(mensajeCompleto)

  } catch (err) {
    console.log('ERROR MENSAJE:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER CONVERSACIÓN ENTRE DOS USUARIOS
============================================================ */
const getConversacion = async (req, res) => {
  const { receptor_id } = req.params
  const emisor_id = req.usuario.id

  try {
    // Marcar mensajes como leídos (los que el otro me mandó a mí)
    const marcados = await pool.query(
      `UPDATE mensajes
       SET leido = TRUE
       WHERE receptor_id = $1 AND emisor_id = $2 AND leido = FALSE
       RETURNING id`,
      [emisor_id, receptor_id]
    )

    // 🔥 Realtime: si le marqué algo como leído, avisarle al otro
    // para que sus mensajes enviados se pinten con doble check al toque
    if (marcados.rows.length > 0) {
      const io = getIO()
      io.to(`user_${receptor_id}`).emit('mensajes_leidos', {
        por: emisor_id
      })
    }

    const result = await pool.query(`
      SELECT 
        m.*,
        u.nombre AS nombre_emisor,
        u.avatar AS avatar_emisor
      FROM mensajes m
      JOIN usuarios u ON m.emisor_id = u.id
      WHERE (m.emisor_id = $1 AND m.receptor_id = $2)
      OR (m.emisor_id = $2 AND m.receptor_id = $1)
      ORDER BY m.creado_at ASC
    `, [emisor_id, receptor_id])

    res.json(result.rows)

  } catch (err) {
    console.log('ERROR GET CONVERSACION:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   MARCAR COMO LEÍDO (usado cuando el chat ya está abierto y
   llega un mensaje nuevo por socket, sin recargar toda la
   conversación)
============================================================ */
const marcarLeido = async (req, res) => {
  const { emisor_id } = req.params
  const receptor_id = req.usuario.id

  try {
    const marcados = await pool.query(
      `UPDATE mensajes
       SET leido = TRUE
       WHERE receptor_id = $1 AND emisor_id = $2 AND leido = FALSE
       RETURNING id`,
      [receptor_id, emisor_id]
    )

    if (marcados.rows.length > 0) {
      const io = getIO()
      io.to(`user_${emisor_id}`).emit('mensajes_leidos', {
        por: receptor_id
      })
    }

    res.json({ message: 'ok' })
  } catch (err) {
    console.log('ERROR MARCAR LEIDO:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER LISTA DE CHATS
============================================================ */
const getChats = async (req, res) => {
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT * FROM (
        SELECT DISTINCT ON (u.id)
          u.id,
          u.nombre,
          u.avatar,
          m.contenido AS ultimo_mensaje,
          m.imagen_url AS ultima_imagen,
          m.creado_at,
          m.leido,
          m.emisor_id AS ultimo_emisor_id
        FROM mensajes m
        JOIN usuarios u ON (
          CASE 
            WHEN m.emisor_id = $1 THEN m.receptor_id 
            ELSE m.emisor_id 
          END = u.id
        )
        WHERE m.emisor_id = $1 OR m.receptor_id = $1
        ORDER BY u.id, m.creado_at DESC
      ) chats
      ORDER BY creado_at DESC
    `, [usuario_id])

    // no_leido = el último mensaje me lo mandó el otro Y todavía no lo he leído
    const chatsFinal = result.rows.map(c => ({
      id: c.id,
      nombre: c.nombre,
      avatar: c.avatar,
      ultimo_mensaje: c.ultimo_mensaje,
      ultima_imagen: c.ultima_imagen,
      creado_at: c.creado_at,
      leido: c.leido,
      no_leido: c.ultimo_emisor_id !== usuario_id && !c.leido
    }))

    res.json(chatsFinal)

  } catch (err) {
    console.log('ERROR GET CHATS:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { enviarMensaje, getConversacion, getChats, marcarLeido }
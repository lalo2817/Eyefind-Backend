// controllers/videoController.js
const pool = require('../config/db')
const { getIO } = require('../socket')

const REACCIONES = {
  like: { nombre: 'like', emoji: '👍' },
  corazon: { nombre: 'corazon', emoji: '❤️' },
  estilo: { nombre: 'estilo', emoji: '✨' },
  risa: { nombre: 'risa', emoji: '😂' },
  asombro: { nombre: 'asombro', emoji: '😮' },
  shock: { nombre: 'shock', emoji: '💀' },
  frio: { nombre: 'frio', emoji: '🥶' },
  triste: { nombre: 'triste', emoji: '😢' }
}

// Crear video (solo URL, ya viene de Supabase)
const crearVideo = async (req, res) => {
  const { contenido, video_url } = req.body
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(
      `INSERT INTO publicaciones (usuario_id, contenido, video_url, tipo)
       VALUES ($1, $2, $3, 'video') RETURNING *`,
      [usuario_id, contenido || null, video_url]
    )

    const video = result.rows[0]

    const userData = await pool.query(
      'SELECT nombre, avatar FROM usuarios WHERE id = $1',
      [usuario_id]
    )
    const autor = userData.rows[0]

    const videoCompleto = {
      ...video,
      nombre: autor?.nombre || null,
      avatar: autor?.avatar || null,
      reacciones_count: 0,
      comentarios_count: 0,
      compartidos_count: 0,
      reaccion: null,
      estado_amistad: 'propio'
    }

    // 🔥 Realtime: aparece solo en Videos Y en el feed de Home (mismo evento)
    const io = getIO()
    io.emit('publicacion_nueva', videoCompleto)

    res.json(videoCompleto)
  } catch (err) {
    console.log('ERROR CREAR VIDEO:', err)
    res.status(500).json({ error: err.message })
  }
}

// Feed de videos paginado
const getVideosFeed = async (req, res) => {
  const { pagina = 1 } = req.query
  const limite = 10
  const offset = (pagina - 1) * limite
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT 
        p.*, 
        u.nombre, 
        u.avatar,

        -- total reacciones
        (SELECT COUNT(*) FROM reacciones r WHERE r.publicacion_id = p.id) AS reacciones_count,

        -- total comentarios
        (SELECT COUNT(*) FROM comentarios c WHERE c.publicacion_id = p.id) AS comentarios_count,

        -- total compartidos
        (SELECT COUNT(*) FROM compartidos s WHERE s.publicacion_id = p.id) AS compartidos_count,

        -- reacción del usuario
        (
          SELECT tipo 
          FROM reacciones r 
          WHERE r.publicacion_id = p.id AND r.usuario_id = $3
          LIMIT 1
        ) AS reaccion,

        -- estado de amistad NORMALIZADO
        (
          SELECT 
            CASE 
              WHEN estado = 'pendiente' THEN 'enviada'
              WHEN estado = 'amigos' THEN 'amigos'
              ELSE 'ninguno'
            END
          FROM amistades a 
          WHERE 
            (a.solicitante_id = $3 AND a.receptor_id = p.usuario_id)
            OR
            (a.receptor_id = $3 AND a.solicitante_id = p.usuario_id)
          LIMIT 1
        ) AS estado_amistad

      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.tipo = 'video'
      ORDER BY p.creado_at DESC
      LIMIT $1 OFFSET $2
    `, [limite, offset, usuario_id])

    // Si no hay relación, devolver 'ninguno' + mapear la reacción a objeto {nombre, emoji}
    const videos = result.rows.map(v => ({
      ...v,
      reaccion: v.reaccion ? REACCIONES[v.reaccion] : null,
      estado_amistad: v.estado_amistad || 'ninguno'
    }))

    res.json(videos)
  } catch (err) {
    console.log('ERROR FEED VIDEOS:', err)
    res.status(500).json({ error: err.message })
  }
}

// Obtener video por ID
const getVideoById = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT 
        p.*, 
        u.nombre, 
        u.avatar,

        -- estado amistad normalizado
        (
          SELECT 
            CASE 
              WHEN estado = 'pendiente' THEN 'enviada'
              WHEN estado = 'amigos' THEN 'amigos'
              ELSE 'ninguno'
            END
          FROM amistades a 
          WHERE 
            (a.solicitante_id = $2 AND a.receptor_id = p.usuario_id)
            OR
            (a.receptor_id = $2 AND a.solicitante_id = p.usuario_id)
          LIMIT 1
        ) AS estado_amistad

      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = $1 AND p.tipo = 'video'
    `, [id, usuario_id])

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Video no encontrado' })

    const video = result.rows[0]
    video.estado_amistad = video.estado_amistad || 'ninguno'

    res.json(video)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Eliminar video
const eliminarVideo = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    const pub = await pool.query(
      'SELECT * FROM publicaciones WHERE id = $1 AND tipo = \'video\'',
      [id]
    )

    if (pub.rows.length === 0)
      return res.status(404).json({ error: 'Video no encontrado' })

    if (pub.rows[0].usuario_id !== usuario_id)
      return res.status(403).json({ error: 'No autorizado' })

    await pool.query('DELETE FROM publicaciones WHERE id = $1', [id])

    const io = getIO()
    io.emit('publicacion_eliminada', { id: Number(id) })

    res.json({ message: 'Video eliminado' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  crearVideo,
  getVideosFeed,
  getVideoById,
  eliminarVideo
}
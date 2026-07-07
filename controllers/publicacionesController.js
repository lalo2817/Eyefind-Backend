const pool = require('../config/db')
const { crearNotificacion } = require('./notificacionesController')
const { getIO } = require('../socket')

// Reacciones disponibles (para normalizar en el feed)
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

/* ============================================================
   CREAR PUBLICACIÓN (TEXTO / IMAGEN / VIDEO)
============================================================ */

const crearPublicacion = async (req, res) => {
  const { contenido, mediaUrl, tipo } = req.body
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(
      `INSERT INTO publicaciones (usuario_id, contenido, imagen_url, tipo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        usuario_id,
        contenido || null,
        mediaUrl || null,
        tipo || 'texto'
      ]
    )

    const publicacion = result.rows[0]

    // 🔥 Traer datos del autor para armar el post tal cual lo espera el feed
    const userData = await pool.query(
      'SELECT nombre, avatar FROM usuarios WHERE id = $1',
      [usuario_id]
    )
    const autor = userData.rows[0]

    const publicacionCompleta = {
      ...publicacion,
      nombre: autor?.nombre || null,
      avatar: autor?.avatar || null,
      reacciones_count: 0,
      comentarios_count: 0,
      compartidos_count: 0,
      reaccion: null,
      estado_amistad: 'propio'
    }

    // 🔥 Realtime: avisar a todos los que están viendo el feed (sin recargar la página)
    const io = getIO()
    io.emit('publicacion_nueva', publicacionCompleta)

    res.json(publicacionCompleta)
  } catch (err) {
    console.log('ERROR CREAR PUBLICACION:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER FEED
============================================================ */

const getFeed = async (req, res) => {
  const usuario_id = req.usuario.id
  const { tipo, pagina = 1 } = req.query

  const limite = 10
  const offset = (pagina - 1) * limite

  try {
    const params = [limite, offset, usuario_id]
    let filtroTipo = ""

    if (tipo) {
      filtroTipo = "AND p.tipo = $4"
      params.push(tipo)
    }

    const result = await pool.query(`
      SELECT 
        p.*,
        u.nombre,
        u.avatar,

        (SELECT COUNT(*) FROM reacciones r WHERE r.publicacion_id = p.id) AS reacciones_count,
        (SELECT COUNT(*) FROM comentarios c WHERE c.publicacion_id = p.id) AS comentarios_count,
        (SELECT COUNT(*) FROM compartidos s WHERE s.publicacion_id = p.id) AS compartidos_count,

        (
          SELECT tipo 
          FROM reacciones r 
          WHERE r.publicacion_id = p.id AND r.usuario_id = $3
          LIMIT 1
        ) AS reaccion,

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
      WHERE 1=1
      ${filtroTipo}
      ORDER BY p.creado_at DESC
      LIMIT $1 OFFSET $2
    `, params)

    const publicaciones = result.rows.map(p => ({
      ...p,
      reaccion: p.reaccion ? REACCIONES[p.reaccion] : null,
      estado_amistad: p.estado_amistad || 'ninguno'
    }))

    res.json(publicaciones)
  } catch (err) {
    console.log('ERROR GET FEED:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER PUBLICACIONES DE UN USUARIO
============================================================ */

const getPublicacionesUsuario = async (req, res) => {
  const { usuario_id } = req.params
  const yo_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT
        p.*,
        u.nombre, u.avatar,
        (SELECT COUNT(*) FROM reacciones r WHERE r.publicacion_id = p.id) AS reacciones_count,
        (SELECT COUNT(*) FROM comentarios c WHERE c.publicacion_id = p.id) AS comentarios_count,
        (SELECT COUNT(*) FROM compartidos s WHERE s.publicacion_id = p.id) AS compartidos_count,
        (
          SELECT tipo FROM reacciones r
          WHERE r.publicacion_id = p.id AND r.usuario_id = $2
          LIMIT 1
        ) AS reaccion_tipo
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.usuario_id = $1
      ORDER BY p.creado_at DESC
    `, [usuario_id, yo_id])

    const publicaciones = result.rows.map(p => ({
      ...p,
      reaccion: p.reaccion_tipo ? REACCIONES[p.reaccion_tipo] : null
    }))

    res.json(publicaciones)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ELIMINAR PUBLICACIÓN
============================================================ */

const eliminarPublicacion = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id

  try {
    const pub = await pool.query(
      'SELECT * FROM publicaciones WHERE id = $1',
      [id]
    )

    if (pub.rows.length === 0)
      return res.status(404).json({ error: 'No encontrada' })

    if (pub.rows[0].usuario_id !== usuario_id)
      return res.status(403).json({ error: 'No autorizado' })

    await pool.query('DELETE FROM publicaciones WHERE id = $1', [id])

    // 🔥 Realtime: que desaparezca sola del feed de todos (Home y Videos)
    const io = getIO()
    io.emit('publicacion_eliminada', { id: Number(id) })

    res.json({ message: 'Publicación eliminada' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  crearPublicacion,
  getFeed,
  getPublicacionesUsuario,
  eliminarPublicacion
}
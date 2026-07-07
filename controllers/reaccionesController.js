const pool = require('../config/db')
const { crearNotificacion } = require('./notificacionesController')
const { getIO } = require('../socket')

const REACCIONES = {
  like: { nombre: 'like', emoji: '👍', mensaje: 'le gustó tu publicación 👍' },
  corazon: { nombre: 'corazon', emoji: '❤️', mensaje: 'le encantó tu publicación ❤️' },
  estilo: { nombre: 'estilo', emoji: '✨', mensaje: 'encontró tu publicación con estilo ✨' },
  risa: { nombre: 'risa', emoji: '😂', mensaje: 'se rió de tu publicación 😂' },
  asombro: { nombre: 'asombro', emoji: '😮', mensaje: 'se asombró con tu publicación 😮' },
  shock: { nombre: 'shock', emoji: '💀', mensaje: 'quedó en shock con tu publicación 💀' },
  frio: { nombre: 'frio', emoji: '🥶', mensaje: 'sintió frío con tu publicación 🥶' },
  triste: { nombre: 'triste', emoji: '😢', mensaje: 'se entristeció con tu publicación 😢' }
}

/* ============================================================
   REACCIONAR / CAMBIAR / QUITAR REACCIÓN
============================================================ */
const reaccionar = async (req, res) => {
  const { publicacion_id, tipo } = req.body
  const usuario_id = req.usuario.id

  try {
    if (!REACCIONES[tipo]) {
      return res.status(400).json({ error: 'Tipo de reacción inválido' })
    }

    const existe = await pool.query(
      'SELECT * FROM reacciones WHERE usuario_id = $1 AND publicacion_id = $2',
      [usuario_id, publicacion_id]
    )

    const pub = await pool.query(
      'SELECT usuario_id FROM publicaciones WHERE id = $1',
      [publicacion_id]
    )

    const autorPublicacion = pub.rows[0]?.usuario_id
    if (!autorPublicacion) return res.status(404).json({ error: 'Publicación no encontrada' })

    /* ============================================================
       QUITAR REACCIÓN (toggle)
    ============================================================ */
    if (existe.rows.length > 0 && existe.rows[0].tipo === tipo) {
      await pool.query(
        'DELETE FROM reacciones WHERE usuario_id = $1 AND publicacion_id = $2',
        [usuario_id, publicacion_id]
      )

      await pool.query(
        `DELETE FROM notificaciones 
         WHERE origen_id = $1 AND publicacion_id = $2 AND tipo = $3`,
        [usuario_id, publicacion_id, tipo]
      )

      return enviarPublicacionActualizada(publicacion_id, usuario_id, res)
    }

    /* ============================================================
       CAMBIAR REACCIÓN
    ============================================================ */
    if (existe.rows.length > 0) {
      await pool.query(
        'UPDATE reacciones SET tipo = $1 WHERE usuario_id = $2 AND publicacion_id = $3',
        [tipo, usuario_id, publicacion_id]
      )

      await pool.query(
        `UPDATE notificaciones 
         SET tipo = $1, mensaje = $2, leida = FALSE
         WHERE origen_id = $3 AND publicacion_id = $4`,
        [tipo, REACCIONES[tipo].mensaje, usuario_id, publicacion_id]
      )

      return enviarPublicacionActualizada(publicacion_id, usuario_id, res)
    }

    /* ============================================================
       NUEVA REACCIÓN
    ============================================================ */
    await pool.query(
      'INSERT INTO reacciones (usuario_id, publicacion_id, tipo) VALUES ($1, $2, $3)',
      [usuario_id, publicacion_id, tipo]
    )

    if (autorPublicacion !== usuario_id) {
      await crearNotificacion(
        autorPublicacion,
        usuario_id,
        tipo,
        REACCIONES[tipo].mensaje,
        { publicacion_id }
      )
    }

    return enviarPublicacionActualizada(publicacion_id, usuario_id, res)

  } catch (err) {
    console.log('ERROR REACCION:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   FUNCIÓN: DEVOLVER PUBLICACIÓN ACTUALIZADA
============================================================ */
const enviarPublicacionActualizada = async (publicacion_id, usuario_id, res) => {
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
        WHERE r.publicacion_id = p.id AND r.usuario_id = $2
        LIMIT 1
      ) AS reaccion

    FROM publicaciones p
    JOIN usuarios u ON p.usuario_id = u.id
    WHERE p.id = $1
  `, [publicacion_id, usuario_id])

  const post = result.rows[0]
  const postParaMi = {
    ...post,
    reaccion: post.reaccion ? REACCIONES[post.reaccion] : null
  }

  // 🔥 Realtime: a TODOS los demás solo les mandamos los contadores actualizados.
  // (la "reaccion" es personal de cada usuario, por eso no se difunde tal cual)
  const io = getIO()
  io.emit('publicacion_actualizada', {
    id: post.id,
    reacciones_count: post.reacciones_count,
    comentarios_count: post.comentarios_count,
    compartidos_count: post.compartidos_count
  })

  // A quien hizo la acción sí le devolvemos su reacción personalizada por HTTP
  res.json(postParaMi)
}

/* ============================================================
   OBTENER TODAS LAS REACCIONES DE UNA PUBLICACIÓN
============================================================ */
const getReacciones = async (req, res) => {
  const { publicacion_id } = req.params

  try {
    const result = await pool.query(
      `SELECT r.*, u.nombre, u.avatar
       FROM reacciones r
       JOIN usuarios u ON r.usuario_id = u.id
       WHERE r.publicacion_id = $1`,
      [publicacion_id]
    )

    const reacciones = result.rows.map(r => ({
      ...r,
      reaccion: REACCIONES[r.tipo] || null
    }))

    res.json(reacciones)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { reaccionar, getReacciones }
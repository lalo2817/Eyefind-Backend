const pool = require('../config/db')
const { getIO } = require('../socket')   // ✔ Import correcto

// ============================================================
// CREAR NOTIFICACIÓN (universal + tiempo real)
// ============================================================

const crearNotificacion = async (usuario_id, origen_id, tipo, mensaje, extra = {}) => {
  try {
    const result = await pool.query(
      `INSERT INTO notificaciones (usuario_id, origen_id, tipo, mensaje, publicacion_id, grupo_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        usuario_id,
        origen_id,
        tipo,
        mensaje,
        extra.publicacion_id || null,
        extra.grupo_id || null
      ]
    )

    const noti = result.rows[0]

    // ⭐ CORRECTO: obtener io dentro de la función
    const io = getIO()
    io.to(`user_${usuario_id}`).emit('notificacion', noti)

  } catch (err) {
    console.log("ERROR CREAR NOTIFICACION:", err)
  }
}

// ============================================================
// OBTENER NOTIFICACIONES
// ============================================================

const getNotificaciones = async (req, res) => {
  const usuario_id = req.usuario.id
  try {
    const result = await pool.query(`
      SELECT n.*, u.nombre as origen_nombre, u.avatar as origen_avatar
      FROM notificaciones n
      JOIN usuarios u ON n.origen_id = u.id
      WHERE n.usuario_id = $1
      ORDER BY n.creado_at DESC
      LIMIT 50
    `, [usuario_id])
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ============================================================
// MARCAR UNA NOTIFICACIÓN COMO LEÍDA
// ============================================================

const marcarLeida = async (req, res) => {
  const { id } = req.params
  const usuario_id = req.usuario.id
  try {
    await pool.query(
      'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2',
      [id, usuario_id]
    )
    res.json({ message: 'Marcada como leída' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ============================================================
// MARCAR TODAS COMO LEÍDAS
// ============================================================

const marcarTodasLeidas = async (req, res) => {
  const usuario_id = req.usuario.id
  try {
    await pool.query(
      'UPDATE notificaciones SET leida = TRUE WHERE usuario_id = $1',
      [usuario_id]
    )
    res.json({ message: 'Todas marcadas como leídas' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ============================================================
// ACTUALIZAR ESTADO (aceptado / rechazado / etc)
// ============================================================

const actualizarEstado = async (req, res) => {
  const { id } = req.params
  const { estado } = req.body
  try {
    await pool.query(
      'UPDATE notificaciones SET estado = $1, leida = TRUE WHERE id = $2',
      [estado, id]
    )
    res.json({ message: 'Estado actualizado' })
  } catch (err) {
    console.log('ERROR ESTADO NOTI:', err)
    res.status(500).json({ error: err.message })
  }
}

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
  crearNotificacion,
  getNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  actualizarEstado
}

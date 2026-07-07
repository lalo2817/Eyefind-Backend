const pool = require('../config/db')

// Definición de los 5 logros
const DEFINICIONES = [
  { id: 1, titulo: 'Primer paso', desc: 'Creaste tu cuenta en Eyefind', emoji: '👣' },
  { id: 2, titulo: 'Social', desc: 'Agrega tu primer amigo', emoji: '🤝' },
  { id: 3, titulo: 'Publicador', desc: 'Haz tu primera publicación', emoji: '📸' },
  { id: 4, titulo: 'Popular', desc: 'Recibe 10 likes en una publicación', emoji: '❤️' },
  { id: 5, titulo: 'Conversador', desc: 'Envía 10 mensajes', emoji: '💬' }
]

// Marca un logro como desbloqueado (si ya lo estaba, no hace nada)
const desbloquear = async (usuario_id, logro_id) => {
  await pool.query(
    `INSERT INTO logros_desbloqueados (usuario_id, logro_id)
     VALUES ($1, $2)
     ON CONFLICT (usuario_id, logro_id) DO NOTHING`,
    [usuario_id, logro_id]
  )
}

/* ============================================================
   GET /api/logros
   Revisa las estadísticas reales del usuario y desbloquea
   automáticamente los logros que ya cumplió, luego devuelve
   la lista completa con su estado real (desbloqueado o no)
============================================================ */
const getLogros = async (req, res) => {
  const usuario_id = req.usuario.id

  try {
    // 1) "Primer paso" -> se desbloquea solo por tener cuenta
    await desbloquear(usuario_id, 1)

    // 2) "Social" -> al menos 1 amigo aceptado
    const amigos = await pool.query(
      `SELECT COUNT(*) FROM amistades
       WHERE (solicitante_id = $1 OR receptor_id = $1) AND estado = 'amigos'`,
      [usuario_id]
    )
    if (parseInt(amigos.rows[0].count) >= 1) await desbloquear(usuario_id, 2)

    // 3) "Publicador" -> al menos 1 publicación
    const pubs = await pool.query(
      `SELECT COUNT(*) FROM publicaciones WHERE usuario_id = $1`,
      [usuario_id]
    )
    if (parseInt(pubs.rows[0].count) >= 1) await desbloquear(usuario_id, 3)

    // 4) "Popular" -> alguna publicación con 10+ reacciones
    const popular = await pool.query(`
      SELECT COUNT(*) FROM (
        SELECT r.publicacion_id, COUNT(*) AS total
        FROM reacciones r
        JOIN publicaciones p ON p.id = r.publicacion_id
        WHERE p.usuario_id = $1
        GROUP BY r.publicacion_id
        HAVING COUNT(*) >= 10
      ) sub
    `, [usuario_id])
    if (parseInt(popular.rows[0].count) >= 1) await desbloquear(usuario_id, 4)

    // 5) "Conversador" -> 10+ mensajes enviados
    const msgs = await pool.query(
      `SELECT COUNT(*) FROM mensajes WHERE emisor_id = $1`,
      [usuario_id]
    )
    if (parseInt(msgs.rows[0].count) >= 10) await desbloquear(usuario_id, 5)

    // Traer lo que quedó desbloqueado (incluye lo que se acaba de marcar arriba)
    const desbloqueados = await pool.query(
      `SELECT logro_id FROM logros_desbloqueados WHERE usuario_id = $1`,
      [usuario_id]
    )
    const idsDesbloqueados = desbloqueados.rows.map(r => r.logro_id)

    const logros = DEFINICIONES.map(l => ({
      ...l,
      desbloqueado: idsDesbloqueados.includes(l.id)
    }))

    res.json(logros)
  } catch (err) {
    console.log('ERROR GET LOGROS:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getLogros }

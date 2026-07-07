const pool = require('../config/db')
const { crearNotificacion } = require('./notificacionesController')

/* ============================================================
   ENVIAR SOLICITUD DE AMISTAD
============================================================ */
const enviarSolicitud = async (req, res) => {
  const { receptor_id } = req.body
  const solicitante_id = req.usuario.id

  try {
    if (solicitante_id === receptor_id)
      return res.status(400).json({ error: 'No puedes agregarte a ti mismo' })

    // Verificar si ya existe relación (en cualquier dirección)
    const existe = await pool.query(`
      SELECT estado FROM amistades 
      WHERE (solicitante_id = $1 AND receptor_id = $2)
         OR (solicitante_id = $2 AND receptor_id = $1)
    `, [solicitante_id, receptor_id])

    if (existe.rows.length > 0) {
      const estado = existe.rows[0].estado

      if (estado === 'pendiente')
        return res.status(400).json({ error: 'Solicitud ya enviada' })

      if (estado === 'amigos')
        return res.status(400).json({ error: 'Ya son amigos' })

      if (estado === 'rechazado')
        return res.status(400).json({ error: 'Solicitud rechazada anteriormente' })
    }

    // Crear solicitud
    await pool.query(
      `INSERT INTO amistades (solicitante_id, receptor_id, estado)
       VALUES ($1, $2, 'pendiente')`,
      [solicitante_id, receptor_id]
    )

    // 🔥 Notificación al receptor (esto ya emite el evento de socket completo,
    // con id, leida, origen_nombre y origen_avatar incluidos)
    await crearNotificacion(
      receptor_id,
      solicitante_id,
      'solicitud',
      'te envió una solicitud de amistad 👥'
    )

    res.json({ message: 'Solicitud enviada' })

  } catch (err) {
    console.log('ERROR SOLICITUD:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ACEPTAR SOLICITUD
============================================================ */
const aceptarSolicitud = async (req, res) => {
  const { solicitante_id } = req.body
  const receptor_id = req.usuario.id

  try {
    await pool.query(
      `UPDATE amistades SET estado = 'amigos'
       WHERE solicitante_id = $1 AND receptor_id = $2`,
      [solicitante_id, receptor_id]
    )

    // 🔥 Notificación al solicitante (ya emite el evento completo por socket)
    await crearNotificacion(
      solicitante_id,
      receptor_id,
      'aceptado',
      'aceptó tu solicitud de amistad ✅'
    )

    res.json({ message: 'Solicitud aceptada' })

  } catch (err) {
    console.log('ERROR ACEPTAR SOLICITUD:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   RECHAZAR SOLICITUD
============================================================ */
const rechazarSolicitud = async (req, res) => {
  const { solicitante_id } = req.body
  const receptor_id = req.usuario.id

  try {
    await pool.query(
      `UPDATE amistades SET estado = 'rechazado'
       WHERE solicitante_id = $1 AND receptor_id = $2`,
      [solicitante_id, receptor_id]
    )

    res.json({ message: 'Solicitud rechazada' })

  } catch (err) {
    console.log('ERROR RECHAZAR SOLICITUD:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER AMIGOS
============================================================ */
const getAmigos = async (req, res) => {
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.avatar
      FROM usuarios u
      JOIN amistades a 
        ON (a.solicitante_id = u.id OR a.receptor_id = u.id)
      WHERE (a.solicitante_id = $1 OR a.receptor_id = $1)
        AND a.estado = 'amigos'
        AND u.id != $1
    `, [usuario_id])

    res.json(result.rows)
  } catch (err) {
    console.log('ERROR GET AMIGOS:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER SOLICITUDES PENDIENTES
============================================================ */
const getSolicitudes = async (req, res) => {
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.avatar, a.creado_at
      FROM usuarios u
      JOIN amistades a ON a.solicitante_id = u.id
      WHERE a.receptor_id = $1 AND a.estado = 'pendiente'
    `, [usuario_id])

    res.json(result.rows)
  } catch (err) {
    console.log('ERROR GET SOLICITUDES:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   OBTENER SUGERENCIAS
============================================================ */
const getSugerencias = async (req, res) => {
  const usuario_id = req.usuario.id

  try {
    const result = await pool.query(`
      SELECT id, nombre, avatar
      FROM usuarios
      WHERE id != $1
        AND bloqueado = FALSE
        AND id NOT IN (
          SELECT CASE 
            WHEN solicitante_id = $1 THEN receptor_id 
            ELSE solicitante_id 
          END
          FROM amistades
          WHERE solicitante_id = $1 OR receptor_id = $1
        )
      LIMIT 20
    `, [usuario_id])

    res.json(result.rows)
  } catch (err) {
    console.log('ERROR GET SUGERENCIAS:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  enviarSolicitud,
  aceptarSolicitud,
  rechazarSolicitud,
  getAmigos,
  getSolicitudes,
  getSugerencias
}
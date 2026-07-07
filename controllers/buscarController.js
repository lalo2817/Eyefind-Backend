const pool = require('../config/db')

const buscar = async (req, res) => {
  const { q } = req.query
  const usuario_id = req.usuario.id

  if (!q || q.trim().length < 2) return res.json({ usuarios: [], grupos: [] })

  const termino = `%${q.toLowerCase()}%`

  try {
    // Buscar usuarios (con el estado de amistad de cada uno respecto a mí)
    const usuarios = await pool.query(`
      SELECT
        u.id, u.nombre, u.avatar, u.creado_at,
        a.estado AS estado_amistad_raw,
        a.solicitante_id
      FROM usuarios u
      LEFT JOIN amistades a
        ON (a.solicitante_id = u.id AND a.receptor_id = $2)
        OR (a.receptor_id = u.id AND a.solicitante_id = $2)
      WHERE (LOWER(u.nombre) LIKE $1)
      AND u.id != $2
      AND u.bloqueado = FALSE
      AND u.verificado = TRUE
      LIMIT 15
    `, [termino, usuario_id])

    // Traducir el estado crudo de la BD a algo que el frontend entienda
    const usuariosConEstado = usuarios.rows.map(u => {
      let estado_amistad = 'ninguno'
      const raw = (u.estado_amistad_raw || '').toString().trim().toLowerCase()

      if (raw === 'amigos') estado_amistad = 'amigos'
      else if (raw === 'pendiente' && u.solicitante_id === usuario_id) estado_amistad = 'enviada'
      else if (raw === 'pendiente') estado_amistad = 'recibida'

      const { estado_amistad_raw, solicitante_id, ...resto } = u
      return { ...resto, estado_amistad }
    })

    // Buscar grupos
    const grupos = await pool.query(`
      SELECT id, nombre, descripcion, categoria, imagen_url FROM grupos
      WHERE LOWER(nombre) LIKE $1 OR LOWER(descripcion) LIKE $1
      LIMIT 10
    `, [termino])

    res.json({
      usuarios: usuariosConEstado,
      grupos: grupos.rows
    })
  } catch (err) {
    console.log('ERROR BUSCAR:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { buscar }
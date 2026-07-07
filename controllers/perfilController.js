const pool = require('../config/db')

// Obtener perfil propio
const getPerfilPropio = async (req, res) => {
  const usuario_id = req.usuario.id
  try {
    const user = await pool.query(
      'SELECT id, nombre, email, avatar, fecha_nacimiento, sexo, biografia, ubicacion, intereses, hobby_favorito, rol, creado_at FROM usuarios WHERE id = $1',
      [usuario_id]
    )
    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })

    const amigos = await pool.query(
      `SELECT COUNT(*) FROM amistades WHERE (solicitante_id = $1 OR receptor_id = $1) AND estado = 'amigos'`,
      [usuario_id]
    )
    const publicaciones = await pool.query(
      'SELECT COUNT(*) FROM publicaciones WHERE usuario_id = $1',
      [usuario_id]
    )

    res.json({
      ...user.rows[0],
      total_amigos: parseInt(amigos.rows[0].count),
      total_publicaciones: parseInt(publicaciones.rows[0].count)
    })
  } catch (err) {
    console.log('ERROR PERFIL PROPIO:', err)
    res.status(500).json({ error: err.message })
  }
}

// Obtener perfil de otro usuario
const getPerfil = async (req, res) => {
  const { usuario_id } = req.params
  const yo_id = req.usuario.id
  try {
    // 🔒 Averiguar si YO soy admin, para saber si puedo ver un perfil
    // suspendido (los moderadores necesitan poder verlo para gestionarlo)
    const yo = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [yo_id])
    const yoSoyAdmin = (yo.rows[0]?.rol || '').toLowerCase() === 'admin'

    const user = await pool.query(
      'SELECT id, nombre, avatar, fecha_nacimiento, sexo, biografia, ubicacion, intereses, hobby_favorito, bloqueado, creado_at FROM usuarios WHERE id = $1',
      [usuario_id]
    )
    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })

    // Si está suspendido y quien mira NO es admin (ni es su propio
    // perfil), se lo ocultamos como si no existiera
    if (user.rows[0].bloqueado && !yoSoyAdmin && parseInt(usuario_id) !== parseInt(yo_id)) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const amigos = await pool.query(
      `SELECT COUNT(*) FROM amistades WHERE (solicitante_id = $1 OR receptor_id = $1) AND estado = 'amigos'`,
      [usuario_id]
    )
    const publicaciones = await pool.query(
      'SELECT COUNT(*) FROM publicaciones WHERE usuario_id = $1',
      [usuario_id]
    )

    // Estado de amistad
    const amistad = await pool.query(
      `SELECT estado, solicitante_id FROM amistades
       WHERE (solicitante_id = $1 AND receptor_id = $2)
       OR (solicitante_id = $2 AND receptor_id = $1)`,
      [yo_id, usuario_id]
    )

    let estado_amistad = 'ninguno'
    if (amistad.rows.length > 0) {
      const a = amistad.rows[0]
      if (a.estado === 'amigos') estado_amistad = 'amigos'
      else if (a.estado === 'pendiente' && a.solicitante_id === parseInt(yo_id)) estado_amistad = 'enviada'
      else if (a.estado === 'pendiente') estado_amistad = 'recibida'
    }

    res.json({
      ...user.rows[0],
      total_amigos: parseInt(amigos.rows[0].count),
      total_publicaciones: parseInt(publicaciones.rows[0].count),
      estado_amistad,
      es_propio: parseInt(usuario_id) === parseInt(yo_id)
    })
  } catch (err) {
    console.log('ERROR PERFIL:', err)
    res.status(500).json({ error: err.message })
  }
}

// Actualizar perfil
const actualizarPerfil = async (req, res) => {
  const usuario_id = req.usuario.id
  const { nombre, biografia, ubicacion, fecha_nacimiento, sexo, avatar, intereses, hobby_favorito } = req.body

  // intereses llega como array desde el frontend, se guarda como JSON
  const interesesJSON = intereses !== undefined ? JSON.stringify(intereses) : null

  try {
    await pool.query(
      `UPDATE usuarios SET
        nombre = COALESCE($1, nombre),
        biografia = COALESCE($2, biografia),
        ubicacion = COALESCE($3, ubicacion),
        fecha_nacimiento = COALESCE($4, fecha_nacimiento),
        sexo = COALESCE($5, sexo),
        avatar = COALESCE($6, avatar),
        intereses = COALESCE($7::jsonb, intereses),
        hobby_favorito = COALESCE($8, hobby_favorito)
       WHERE id = $9`,
      [nombre, biografia, ubicacion, fecha_nacimiento, sexo, avatar, interesesJSON, hobby_favorito, usuario_id]
    )

    const updated = await pool.query(
      'SELECT id, nombre, email, avatar, fecha_nacimiento, sexo, biografia, ubicacion, intereses, hobby_favorito FROM usuarios WHERE id = $1',
      [usuario_id]
    )

    res.json({ message: 'Perfil actualizado', usuario: updated.rows[0] })
  } catch (err) {
    console.log('ERROR ACTUALIZAR PERFIL:', err)
    res.status(500).json({ error: err.message })
  }
}

// Estado de amistad
const getEstadoAmistad = async (req, res) => {
  const { usuario_id } = req.params
  const yo_id = req.usuario.id
  try {
    const amistad = await pool.query(
      `SELECT estado, solicitante_id FROM amistades
       WHERE (solicitante_id = $1 AND receptor_id = $2)
       OR (solicitante_id = $2 AND receptor_id = $1)`,
      [yo_id, usuario_id]
    )

    if (amistad.rows.length === 0) return res.json({ estado: 'ninguno' })

    const a = amistad.rows[0]
    let estado = 'ninguno'
    if (a.estado === 'amigos') estado = 'amigos'
    else if (a.estado === 'pendiente' && a.solicitante_id === parseInt(yo_id)) estado = 'enviada'
    else if (a.estado === 'pendiente') estado = 'recibida'

    res.json({ estado })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Lista de amigos de un perfil (el propio o el de alguien más)
const getAmigosDeUsuario = async (req, res) => {
  const { usuario_id } = req.params

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
    console.log('ERROR GET AMIGOS DE USUARIO:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getPerfilPropio, getPerfil, actualizarPerfil, getEstadoAmistad, getAmigosDeUsuario }
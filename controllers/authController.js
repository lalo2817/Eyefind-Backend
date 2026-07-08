const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')

const generarCodigo = () => Math.floor(100000 + Math.random() * 900000).toString()

const enviarCodigo = async (email, codigo) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  })
  await transporter.sendMail({
    from: `"Eyefind" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Código de verificación - Eyefind',
    html: `<h2>Tu código es: <strong>${codigo}</strong></h2><p>No compartas este código con nadie.</p>`
  })
}

const registro = async (req, res) => {
  const { nombre, email, password } = req.body
  try {
    const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])

    if (existe.rows.length > 0) {
      // Si ya existe pero nunca se verificó, le reenviamos el código
      // en vez de bloquearlo para siempre (por ejemplo, si el correo
      // falló la primera vez).
      if (!existe.rows[0].verificado) {
        const nuevoCodigo = generarCodigo()
        await pool.query('UPDATE usuarios SET codigo_verificacion = $1 WHERE email = $2', [nuevoCodigo, email])
        await enviarCodigo(email, nuevoCodigo)
        return res.json({ message: 'Código reenviado al correo' })
      }
      return res.status(400).json({ error: 'Email ya registrado' })
    }

    const hash = await bcrypt.hash(password, 10)
    const codigo = generarCodigo()

    const nuevoUsuario = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, codigo_verificacion) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre, email, hash, codigo]
    )

    try {
      await enviarCodigo(email, codigo)
    } catch (mailErr) {
      // Si el correo falla, deshacemos el registro para que la
      // persona pueda intentarlo de nuevo sin quedar atascada.
      await pool.query('DELETE FROM usuarios WHERE id = $1', [nuevoUsuario.rows[0].id])
      console.log('ERROR ENVIANDO CORREO:', mailErr)
      return res.status(500).json({ error: 'No se pudo enviar el correo de verificación. Intenta de nuevo.' })
    }

    res.json({ message: 'Código enviado al correo' })
  } catch (err) {
    console.log('ERROR REGISTRO:', err)
    res.status(500).json({ error: err.message })
  }
}

const verificarCodigo = async (req, res) => {
  const { email, codigo } = req.body
  try {
    const user = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])
    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (user.rows[0].codigo_verificacion !== codigo) return res.status(400).json({ error: 'Código incorrecto' })
    await pool.query('UPDATE usuarios SET verificado = TRUE WHERE email = $1', [email])
    const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({
      message: 'Cuenta verificada', token,
      usuario: {
        id: user.rows[0].id,
        nombre: user.rows[0].nombre,
        email: user.rows[0].email,
        avatar: user.rows[0].avatar
      }
    })
  } catch (err) {
    console.log('ERROR VERIFICAR:', err)
    res.status(500).json({ error: err.message })
  }
}

const login = async (req, res) => {
  const { email, password } = req.body
  try {
    const user = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])
    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (!user.rows[0].verificado) return res.status(403).json({ error: 'Cuenta no verificada' })

    if (user.rows[0].bloqueado) {
      const hasta = user.rows[0].suspendido_hasta

      if (hasta && new Date(hasta) <= new Date()) {
        // 🔥 Ya se cumplieron los 3 días de suspensión: se reactiva sola
        await pool.query(
          `UPDATE usuarios SET bloqueado = FALSE, suspendido_hasta = NULL WHERE id = $1`,
          [user.rows[0].id]
        )
        user.rows[0].bloqueado = false
      } else if (hasta) {
        // Todavía le falta tiempo de suspensión: decirle cuánto falta
        const msFaltan = new Date(hasta) - new Date()
        const diasFaltan = Math.max(1, Math.ceil(msFaltan / (1000 * 60 * 60 * 24)))
        return res.status(403).json({
          error: `Tu cuenta está suspendida por incumplir las normas de la comunidad. Podrás volver a entrar en ${diasFaltan} día${diasFaltan === 1 ? '' : 's'}.`
        })
      } else {
        // bloqueado=true sin fecha de fin -> bloqueo permanente (ej:
        // cuenta eliminada por moderación)
        return res.status(403).json({ error: 'Esta cuenta ya no está disponible' })
      }
    }

    const valido = await bcrypt.compare(password, user.rows[0].password)
    if (!valido) return res.status(401).json({ error: 'Contraseña incorrecta' })
    const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({
      token,
      usuario: {
        id: user.rows[0].id,
        nombre: user.rows[0].nombre,
        email: user.rows[0].email,
        avatar: user.rows[0].avatar,
        rol: user.rows[0].rol
      }
    })
  } catch (err) {
    console.log('ERROR LOGIN:', err)
    res.status(500).json({ error: err.message })
  }
}

const solicitarRecuperacion = async (req, res) => {
  const { email } = req.body
  try {
    const user = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])
    if (user.rows.length === 0) return res.status(404).json({ error: 'No existe una cuenta con ese correo' })
    const codigo = generarCodigo()
    await pool.query('UPDATE usuarios SET codigo_verificacion = $1 WHERE email = $2', [codigo, email])
    await enviarCodigo(email, codigo)
    res.json({ message: 'Código enviado al correo' })
  } catch (err) {
    console.log('ERROR RECUPERAR:', err)
    res.status(500).json({ error: err.message })
  }
}

const verificarRecuperacion = async (req, res) => {
  const { email, codigo } = req.body
  try {
    const user = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])
    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (user.rows[0].codigo_verificacion !== codigo) return res.status(400).json({ error: 'Código incorrecto' })
    res.json({ message: 'Código válido' })
  } catch (err) {
    console.log('ERROR VERIFICAR RECUPERAR:', err)
    res.status(500).json({ error: err.message })
  }
}

const cambiarPassword = async (req, res) => {
  const { email, password } = req.body
  try {
    const hash = await bcrypt.hash(password, 10)
    await pool.query('UPDATE usuarios SET password = $1, codigo_verificacion = NULL WHERE email = $2', [hash, email])
    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) {
    console.log('ERROR CAMBIAR PASSWORD:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ELIMINAR CUENTA (anonimizar, no borrar de verdad)
   Se borran publicaciones, amistades y membresías de grupo.
   Los mensajes NO se tocan: se quedan como "Usuario eliminado"
   para que la otra persona no vea un chat roto.
============================================================ */
const eliminarCuenta = async (req, res) => {
  const usuario_id = req.usuario.id
  const { password } = req.body

  try {
    const user = await pool.query('SELECT * FROM usuarios WHERE id = $1', [usuario_id])
    if (user.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })

    const valido = await bcrypt.compare(password, user.rows[0].password)
    if (!valido) return res.status(401).json({ error: 'Contraseña incorrecta' })

    // 🔒 Si es admin de un grupo con más gente, primero debe transferir
    // la administración (mismo criterio que al salir de un grupo)
    const gruposComoAdmin = await pool.query(`
      SELECT gm.grupo_id
      FROM grupo_miembros gm
      WHERE gm.usuario_id = $1 AND gm.rol = 'admin'
        AND EXISTS (
          SELECT 1 FROM grupo_miembros gm2
          WHERE gm2.grupo_id = gm.grupo_id AND gm2.usuario_id != $1
        )
    `, [usuario_id])

    if (gruposComoAdmin.rows.length > 0) {
      return res.status(400).json({
        error: 'Eres administrador de uno o más grupos con otros integrantes. Dale la administración a alguien más antes de borrar tu cuenta.'
      })
    }

    // 1) Borrar publicaciones (en cascada se borran también sus
    // reacciones, comentarios, compartidos y notificaciones ligadas)
    await pool.query('DELETE FROM publicaciones WHERE usuario_id = $1', [usuario_id])

    // 2) Salir de todos los grupos
    await pool.query('DELETE FROM grupo_miembros WHERE usuario_id = $1', [usuario_id])

    // 3) Borrar amistades (en ambas direcciones)
    await pool.query(
      'DELETE FROM amistades WHERE solicitante_id = $1 OR receptor_id = $1',
      [usuario_id]
    )

    // 4) Borrar sus notificaciones recibidas
    await pool.query('DELETE FROM notificaciones WHERE usuario_id = $1', [usuario_id])

    // 5) Anonimizar la cuenta (los mensajes se quedan intactos a propósito)
    const passwordInutilizable = await bcrypt.hash(`eliminado-${Date.now()}-${Math.random()}`, 10)
    await pool.query(
      `UPDATE usuarios SET
        nombre = 'Usuario eliminado',
        avatar = NULL,
        biografia = NULL,
        ubicacion = NULL,
        intereses = '[]'::jsonb,
        hobby_favorito = NULL,
        email = $2,
        password = $3,
        bloqueado = TRUE,
        cuenta_eliminada = TRUE
      WHERE id = $1`,
      [usuario_id, `eliminado_${usuario_id}_${Date.now()}@eyefind.local`, passwordInutilizable]
    )

    res.json({ message: 'Cuenta eliminada correctamente' })

  } catch (err) {
    console.log('ERROR ELIMINAR CUENTA:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { registro, verificarCodigo, login, solicitarRecuperacion, verificarRecuperacion, cambiarPassword, eliminarCuenta }

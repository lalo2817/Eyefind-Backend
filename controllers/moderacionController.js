const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const { getIO } = require('../socket')

// 🔒 Verifica que quien llama sea admin de verdad (consultando la BD,
// no confiando en lo que venga en el token, por seguridad)
const esAdmin = async (usuario_id) => {
  const r = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id])
  return (r.rows[0]?.rol || '').toLowerCase() === 'admin'
}

/* ============================================================
   REPORTAR UNA PUBLICACIÓN (cualquier usuario logueado)
============================================================ */
const reportarPublicacion = async (req, res) => {
  const reportante_id = req.usuario.id
  const { publicacion_id, motivo } = req.body

  try {
    const pub = await pool.query(
      'SELECT usuario_id FROM publicaciones WHERE id = $1',
      [publicacion_id]
    )
    if (pub.rows.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    const reportado_id = pub.rows[0].usuario_id

    if (reportado_id === reportante_id) {
      return res.status(400).json({ error: 'No puedes reportar tu propia publicación' })
    }

    await pool.query(
      `INSERT INTO reportes (reportado_id, reportante_id, publicacion_id, motivo, estado)
       VALUES ($1, $2, $3, $4, 'pendiente')`,
      [reportado_id, reportante_id, publicacion_id, motivo || 'Contenido inapropiado']
    )

    // 🔥 Avisar a TODOS los admins (notificación + badge en vivo)
    const admins = await pool.query(`SELECT id FROM usuarios WHERE rol = 'admin'`)
    const io = getIO()

    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notificaciones (usuario_id, origen_id, tipo, mensaje, publicacion_id)
         VALUES ($1, $2, 'reporte', 'Se reportó una publicación', $3)`,
        [admin.id, reportante_id, publicacion_id]
      )
      io.to(`user_${admin.id}`).emit('nuevo_reporte', { publicacion_id })
    }

    res.json({ message: 'Publicación reportada. Los moderadores ya están revisando.' })
  } catch (err) {
    console.log('ERROR REPORTAR:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   LISTA DE REPORTES PENDIENTES (solo admin)
============================================================ */
const getReportesPendientes = async (req, res) => {
  try {
    if (!(await esAdmin(req.usuario.id))) {
      return res.status(403).json({ error: 'Solo un moderador puede ver esto' })
    }

    const result = await pool.query(`
      SELECT
        r.id, r.motivo, r.estado, r.creado_at,
        r.publicacion_id,
        ureportado.id AS reportado_id, ureportado.nombre AS reportado_nombre,
        ureportado.avatar AS reportado_avatar, ureportado.bloqueado,
        ureportante.nombre AS reportante_nombre,
        p.contenido AS publicacion_contenido,
        p.imagen_url, p.video_url
      FROM reportes r
      JOIN usuarios ureportado ON r.reportado_id = ureportado.id
      LEFT JOIN usuarios ureportante ON r.reportante_id = ureportante.id
      LEFT JOIN publicaciones p ON r.publicacion_id = p.id
      WHERE r.estado = 'pendiente'
      ORDER BY r.creado_at DESC
    `)

    res.json(result.rows)
  } catch (err) {
    console.log('ERROR GET REPORTES:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   CONTADOR DE PENDIENTES (para el numerito en Configuración)
============================================================ */
const getContadorPendientes = async (req, res) => {
  try {
    if (!(await esAdmin(req.usuario.id))) {
      return res.json({ total: 0 })
    }

    const result = await pool.query(
      `SELECT COUNT(*) FROM reportes WHERE estado = 'pendiente'`
    )
    res.json({ total: parseInt(result.rows[0].count) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   SUSPENDER CUENTA (solo admin) — bloqueo reversible
============================================================ */
const suspenderCuenta = async (req, res) => {
  try {
    if (!(await esAdmin(req.usuario.id))) {
      return res.status(403).json({ error: 'Solo un moderador puede suspender cuentas' })
    }

    const { usuario_id } = req.params
    if (!usuario_id || isNaN(parseInt(usuario_id))) {
      return res.status(400).json({ error: 'Falta el id del usuario a suspender' })
    }

    // 🔥 Suspensión automática de 3 días. Pasado ese tiempo, el login
    // la reactiva sola (ver authController.js)
    await pool.query(
      `UPDATE usuarios SET bloqueado = TRUE, suspendido_hasta = NOW() + INTERVAL '3 days'
       WHERE id = $1`,
      [usuario_id]
    )

    await pool.query(
      `UPDATE reportes SET estado = 'resuelto' WHERE reportado_id = $1 AND estado = 'pendiente'`,
      [usuario_id]
    )

    res.json({ message: 'Cuenta suspendida por 3 días' })
  } catch (err) {
    console.log('ERROR SUSPENDER:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   QUITAR SUSPENSIÓN (por si fue un error / falsa alarma)
============================================================ */
const reactivarCuenta = async (req, res) => {
  try {
    if (!(await esAdmin(req.usuario.id))) {
      return res.status(403).json({ error: 'Solo un moderador puede reactivar cuentas' })
    }

    const { usuario_id } = req.params
    if (!usuario_id || isNaN(parseInt(usuario_id))) {
      return res.status(400).json({ error: 'Falta el id del usuario a reactivar' })
    }
    await pool.query(
      `UPDATE usuarios SET bloqueado = FALSE, suspendido_hasta = NULL WHERE id = $1`,
      [usuario_id]
    )
    res.json({ message: 'Cuenta reactivada' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   ELIMINAR CUENTA (solo admin) — acción definitiva tras revisar
   Reutiliza la misma lógica de "anonimizar" que ya usamos cuando
   un usuario borra su propia cuenta: no se rompen sus chats con
   otras personas, solo desaparece su info real.
============================================================ */
const eliminarCuentaModerada = async (req, res) => {
  try {
    if (!(await esAdmin(req.usuario.id))) {
      return res.status(403).json({ error: 'Solo un moderador puede eliminar cuentas' })
    }

    const { usuario_id } = req.params
    if (!usuario_id || isNaN(parseInt(usuario_id))) {
      return res.status(400).json({ error: 'Falta el id del usuario a eliminar' })
    }
    // 🔒 Si era admin de algún grupo con más gente, hay que pasarle la
    // administración a otra persona ANTES de borrarlo, si no, el grupo
    // se queda sin ningún admin para siempre
    const gruposComoAdmin = await pool.query(
      `SELECT grupo_id FROM grupo_miembros WHERE usuario_id = $1 AND rol = 'admin'`,
      [usuario_id]
    )

    for (const g of gruposComoAdmin.rows) {
      const siguiente = await pool.query(
        `SELECT usuario_id FROM grupo_miembros
         WHERE grupo_id = $1 AND usuario_id != $2
         ORDER BY unido_at ASC LIMIT 1`,
        [g.grupo_id, usuario_id]
      )
      if (siguiente.rows.length > 0) {
        await pool.query(
          `UPDATE grupo_miembros SET rol = 'admin' WHERE grupo_id = $1 AND usuario_id = $2`,
          [g.grupo_id, siguiente.rows[0].usuario_id]
        )
      }
      // Si no hay nadie más en el grupo, no pasa nada: el grupo se queda
      // sin miembros, igual que cuando cualquiera sale de un grupo solo
    }

    await pool.query('DELETE FROM publicaciones WHERE usuario_id = $1', [usuario_id])
    await pool.query('DELETE FROM grupo_miembros WHERE usuario_id = $1', [usuario_id])
    await pool.query(
      'DELETE FROM amistades WHERE solicitante_id = $1 OR receptor_id = $1',
      [usuario_id]
    )
    await pool.query('DELETE FROM notificaciones WHERE usuario_id = $1', [usuario_id])

    const passwordInutilizable = await bcrypt.hash(`moderado-${Date.now()}-${Math.random()}`, 10)
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

    await pool.query(
      `UPDATE reportes SET estado = 'resuelto' WHERE reportado_id = $1 AND estado = 'pendiente'`,
      [usuario_id]
    )

    res.json({ message: 'Cuenta eliminada por moderación' })
  } catch (err) {
    console.log('ERROR ELIMINAR CUENTA MODERADA:', err)
    res.status(500).json({ error: err.message })
  }
}

/* ============================================================
   IGNORAR REPORTE (solo admin) — lo marca como revisado sin
   tomar ninguna acción contra la cuenta reportada
============================================================ */
const ignorarReporte = async (req, res) => {
  try {
    if (!(await esAdmin(req.usuario.id))) {
      return res.status(403).json({ error: 'Solo un moderador puede hacer esto' })
    }

    const { reporte_id } = req.params
    await pool.query(
      `UPDATE reportes SET estado = 'ignorado' WHERE id = $1`,
      [reporte_id]
    )

    res.json({ message: 'Reporte ignorado' })
  } catch (err) {
    console.log('ERROR IGNORAR REPORTE:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  reportarPublicacion,
  getReportesPendientes,
  getContadorPendientes,
  suspenderCuenta,
  reactivarCuenta,
  eliminarCuentaModerada,
  ignorarReporte
}
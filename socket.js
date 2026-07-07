const { Server } = require('socket.io')

let io = null

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET','POST','PUT','DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  })

  io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id)

    /* ============================================================
       SALAS PERSONALES
    ============================================================ */
    socket.on('unirse', (usuario_id) => {
      socket.join(`user_${usuario_id}`)
    })

    /* ============================================================
       SALAS DE GRUPO
       Sin esto, todo lo que el backend manda con
       io.to(`grupo_${id}`).emit(...) no le llega a nadie.
    ============================================================ */
    socket.on('unirse_grupo', (grupo_id) => {
      socket.join(`grupo_${grupo_id}`)
    })

    /* ============================================================
       MENSAJES PRIVADOS
    ============================================================ */
    socket.on('mensaje_privado', (data) => {
      io.to(`user_${data.receptor_id}`).emit('nuevo_mensaje', data)
    })

    socket.on('escribiendo', (data) => {
      io.to(`user_${data.receptor_id}`).emit('escribiendo', data)
    })

    /* ============================================================
       NOTIFICACIONES
    ============================================================ */
    socket.on('nueva_notificacion', (data) => {
      io.to(`user_${data.usuario_id}`).emit('notificacion', data)
    })

    /* ============================================================
       REACCIONES
    ============================================================ */
    socket.on('reaccion_actualizada', (data) => {
      io.emit('reaccion_actualizada', data)
    })

    /* ============================================================
       COMENTARIOS
    ============================================================ */
    socket.on('comentario_nuevo', (data) => {
      io.emit('comentario_nuevo', data)
    })

    socket.on('comentario_eliminado', (data) => {
      io.emit('comentario_eliminado', data)
    })

    /* ============================================================
       COMPARTIR POR MENSAJE
    ============================================================ */
    socket.on('compartir_mensaje', (data) => {
      io.to(`user_${data.receptor_id}`).emit('compartido_mensaje', data)
    })

    /* ============================================================
       COMPARTIR EN GRUPO
    ============================================================ */
    socket.on('compartir_grupo', (data) => {
      io.to(`grupo_${data.grupo_id}`).emit('compartido_grupo', data)
    })

    /* ============================================================
       GRUPOS
    ============================================================ */
    socket.on('grupo_creado', (data) => {
      io.emit('grupo_creado', data)
    })

    socket.on('grupo_actualizado', (data) => {
      io.emit('grupo_actualizado', data)
    })

    socket.on('grupo_unido', (data) => {
      io.to(`grupo_${data.grupo_id}`).emit('grupo_unido', data)
    })

    socket.on('grupo_salido', (data) => {
      io.to(`grupo_${data.grupo_id}`).emit('grupo_salido', data)
    })

    socket.on('grupo_invitacion', (data) => {
      io.to(`user_${data.invitado_id}`).emit('grupo_invitacion', data)
    })

    socket.on('grupo_publicacion', (data) => {
      io.to(`grupo_${data.grupo_id}`).emit('grupo_publicacion', data)
    })

    socket.on('grupo_publicacion_eliminada', (data) => {
      io.to(`grupo_${data.grupo_id}`).emit('grupo_publicacion_eliminada', data)
    })

    /* ============================================================
       DESCONECTAR
    ============================================================ */
    socket.on('disconnect', () => {
      console.log('Usuario desconectado:', socket.id)
    })
  })

  return io
}

function getIO() {
  if (!io) throw new Error('Socket.io no inicializado')
  return io
}

module.exports = { initSocket, getIO }

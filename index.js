const express = require('express')
const cors = require('cors')
const http = require('http')
require('dotenv').config()

// Inicializar socket desde archivo separado
const { initSocket } = require('./socket')

// Rutas
const authRoutes = require('./routes/auth')
const uploadRoutes = require('./routes/uploadRoutes')
const publicacionesRoutes = require('./routes/publicaciones')
const reaccionesRoutes = require('./routes/reacciones')
const comentariosRoutes = require('./routes/comentarios')
const amigosRoutes = require('./routes/amigos')
const notificacionesRoutes = require('./routes/notificaciones')
const mensajesRoutes = require('./routes/mensajes')
const perfilRoutes = require('./routes/perfil')
const buscarRoutes = require('./routes/buscar')
const gruposRoutes = require('./routes/grupos')
const videosRoutes = require('./routes/videos')
const compartirRoutes = require('./routes/compartir')
const logrosRoutes = require('./routes/logros')
const moderacionRoutes = require('./routes/moderacion')

const app = express()
const server = http.createServer(app)

// ⭐ Inicializar Socket.io SIN circular dependency
const io = initSocket(server)

// JSON grande (videos)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Rutas API
app.use('/api/auth', authRoutes)
app.use('/api/upload', uploadRoutes) // ✔ AHORA SÍ FUNCIONA
app.use('/api/publicaciones', publicacionesRoutes)
app.use('/api/reacciones', reaccionesRoutes)
app.use('/api/comentarios', comentariosRoutes)
app.use('/api/amigos', amigosRoutes)
app.use('/api/notificaciones', notificacionesRoutes)
app.use('/api/mensajes', mensajesRoutes)
app.use('/api/perfil', perfilRoutes)
app.use('/api/buscar', buscarRoutes)
app.use('/api/grupos', gruposRoutes)
app.use('/api/videos', videosRoutes)
app.use('/api/compartir', compartirRoutes)
app.use('/api/logros', logrosRoutes)
app.use('/api/moderacion', moderacionRoutes)

// Middleware de errores globales
app.use((err, req, res, next) => {
  console.error('ERROR GLOBAL:', err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`)
})
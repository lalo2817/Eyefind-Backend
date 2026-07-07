const express = require('express')
const router = express.Router()
const { enviarSolicitud, aceptarSolicitud, rechazarSolicitud, getAmigos, getSolicitudes, getSugerencias } = require('../controllers/amigosController')
const verifyToken = require('../middlewares/verifyToken')

router.post('/solicitud', verifyToken, enviarSolicitud)
router.post('/aceptar', verifyToken, aceptarSolicitud)
router.post('/rechazar', verifyToken, rechazarSolicitud)
router.get('/lista', verifyToken, getAmigos)
router.get('/solicitudes', verifyToken, getSolicitudes)
router.get('/sugerencias', verifyToken, getSugerencias)

module.exports = router

const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')
const {
  crearNotificacion,
  getNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  actualizarEstado
} = require('../controllers/notificacionesController')

router.get('/', verifyToken, getNotificaciones)
router.put('/:id/leer', verifyToken, marcarLeida)
router.put('/leer/todas', verifyToken, marcarTodasLeidas)
router.put('/:id/estado', verifyToken, actualizarEstado)

module.exports = router
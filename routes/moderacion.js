const express = require('express')
const router = express.Router()
const {
  reportarPublicacion,
  getReportesPendientes,
  getContadorPendientes,
  suspenderCuenta,
  reactivarCuenta,
  eliminarCuentaModerada,
  ignorarReporte
} = require('../controllers/moderacionController')
const verifyToken = require('../middlewares/verifytoken')

router.post('/reportar', verifyToken, reportarPublicacion)
router.get('/', verifyToken, getReportesPendientes)
router.get('/contador', verifyToken, getContadorPendientes)
router.put('/reporte/:reporte_id/ignorar', verifyToken, ignorarReporte)
router.put('/:usuario_id/suspender', verifyToken, suspenderCuenta)
router.put('/:usuario_id/reactivar', verifyToken, reactivarCuenta)
router.delete('/:usuario_id', verifyToken, eliminarCuentaModerada)

module.exports = router
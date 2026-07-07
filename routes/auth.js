const express = require('express')
const router = express.Router()
const { registro, verificarCodigo, login, solicitarRecuperacion, verificarRecuperacion, cambiarPassword, eliminarCuenta } = require('../controllers/authController')
const verifyToken = require('../middlewares/verifyToken')

router.post('/registro', registro)
router.post('/verificar', verificarCodigo)
router.post('/login', login)
router.post('/recuperar', solicitarRecuperacion)
router.post('/verificar-recuperar', verificarRecuperacion)
router.post('/nueva-password', cambiarPassword)
router.delete('/eliminar-cuenta', verifyToken, eliminarCuenta)

module.exports = router
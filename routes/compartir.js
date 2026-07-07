const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')

const {
  compartirPorMensaje,
  compartirEnGrupo,
  getCompartidos
} = require('../controllers/compartirController')

router.post('/mensaje', verifyToken, compartirPorMensaje)
router.post('/grupo', verifyToken, compartirEnGrupo)
router.get('/:publicacion_id', verifyToken, getCompartidos)

module.exports = router

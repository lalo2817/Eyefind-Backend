const express = require('express')
const router = express.Router()
const { crearPublicacion, getFeed, getPublicacionesUsuario, eliminarPublicacion } = require('../controllers/publicacionesController')
const verifyToken = require('../middlewares/verifyToken')

router.post('/', verifyToken, crearPublicacion)
router.get('/feed', verifyToken, getFeed)
router.get('/usuario/:usuario_id', verifyToken, getPublicacionesUsuario)
router.delete('/:id', verifyToken, eliminarPublicacion)

module.exports = router
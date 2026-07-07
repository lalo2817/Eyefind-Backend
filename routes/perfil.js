const express = require('express')
const router = express.Router()
const { getPerfilPropio, getPerfil, actualizarPerfil, getEstadoAmistad, getAmigosDeUsuario } = require('../controllers/perfilController')
const verifyToken = require('../middlewares/verifyToken')

router.get('/me', verifyToken, getPerfilPropio)
router.get('/estado/:usuario_id', verifyToken, getEstadoAmistad)
router.get('/:usuario_id/amigos', verifyToken, getAmigosDeUsuario)
router.get('/:usuario_id', verifyToken, getPerfil)
router.put('/actualizar', verifyToken, actualizarPerfil)

module.exports = router
const express = require('express')
const router = express.Router()
const { comentar, getComentarios, eliminarComentario } = require('../controllers/comentariosController')
const verifyToken = require('../middlewares/verifytoken')

router.post('/', verifyToken, comentar)
router.get('/:publicacion_id', verifyToken, getComentarios)
router.delete('/:id', verifyToken, eliminarComentario)

module.exports = router
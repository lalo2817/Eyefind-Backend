const express = require('express')
const router = express.Router()
const { enviarMensaje, getConversacion, getChats, marcarLeido } = require('../controllers/mensajesController')
const verifyToken = require('../middlewares/verifytoken')

router.post('/', verifyToken, enviarMensaje)
router.get('/chats', verifyToken, getChats)
router.put('/:emisor_id/leido', verifyToken, marcarLeido)
router.get('/:receptor_id', verifyToken, getConversacion)

module.exports = router
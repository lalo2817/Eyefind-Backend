const express = require('express')
const router = express.Router()
const { reaccionar, getReacciones } = require('../controllers/reaccionesController')
const verifyToken = require('../middlewares/verifytoken')

router.post('/', verifyToken, reaccionar)
router.get('/:publicacion_id', verifyToken, getReacciones)

module.exports = router

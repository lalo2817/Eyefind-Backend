const express = require('express')
const router = express.Router()
const { buscar } = require('../controllers/buscarController')
const verifyToken = require('../middlewares/verifyToken')

router.get('/', verifyToken, buscar)

module.exports = router
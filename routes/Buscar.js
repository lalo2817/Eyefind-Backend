const express = require('express')
const router = express.Router()
const { buscar } = require('../controllers/buscarController')
const verifyToken = require('../middlewares/verifytoken')

router.get('/', verifyToken, buscar)

module.exports = router
const express = require('express')
const router = express.Router()
const { getLogros } = require('../controllers/logrosController')
const verifyToken = require('../middlewares/verifyToken')

router.get('/', verifyToken, getLogros)

module.exports = router

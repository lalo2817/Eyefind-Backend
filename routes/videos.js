// routes/videos.js
const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifytoken')

const {
  crearVideo,
  getVideosFeed,
  getVideoById,
  eliminarVideo
} = require('../controllers/videoController')

router.post('/', verifyToken, crearVideo)
router.get('/feed', verifyToken, getVideosFeed)
router.get('/:id', verifyToken, getVideoById)
router.delete('/:id', verifyToken, eliminarVideo)

module.exports = router

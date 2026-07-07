const express = require('express')
const router = express.Router()

const upload = require('../config/multer')
const verifyToken = require('../middlewares/verifyToken')

const {
  subirAvatar,
  subirPublicacion,
  subirMensaje
} = require('../controllers/uploadController')

// ⭐ Ruta para subir avatar
router.post('/avatar', verifyToken, upload.single('archivo'), subirAvatar)

// ⭐ Ruta para subir imagen/video de publicación
router.post('/publicacion', verifyToken, upload.single('archivo'), subirPublicacion)

// ⭐ Ruta para subir imagen de mensaje
router.post('/mensaje', verifyToken, upload.single('archivo'), subirMensaje)

module.exports = router

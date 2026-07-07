const multer = require('multer')

// Usamos memoryStorage para poder enviar el buffer a Supabase
const storage = multer.memoryStorage()

// Instancia correcta de multer
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten imágenes y videos'))
    }
  }
})

// EXPORTACIÓN CORRECTA
module.exports = upload

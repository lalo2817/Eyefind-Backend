const supabase = require('../config/supabase')

const subirArchivo = async (buffer, nombre, bucket, mimetype) => {
  const extension = mimetype.split('/')[1]
  const nombreArchivo = `${Date.now()}_${nombre}.${extension}`

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(nombreArchivo, buffer, {
      contentType: mimetype,
      upsert: false
    })

  if (error) throw new Error(error.message)

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(nombreArchivo)

  return urlData.publicUrl
}

// Subir avatar
const subirAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' })
    const url = await subirArchivo(req.file.buffer, 'avatar', 'avatares', req.file.mimetype)
    res.json({ url })
  } catch (err) {
    console.log('ERROR AVATAR:', err)
    res.status(500).json({ error: err.message })
  }
}

// Subir publicación
const subirPublicacion = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' })
    const bucket = req.file.mimetype.startsWith('video/') ? 'publicaciones' : 'publicaciones'
    const url = await subirArchivo(req.file.buffer, 'pub', bucket, req.file.mimetype)
    res.json({ url })
  } catch (err) {
    console.log('ERROR PUBLICACION:', err)
    res.status(500).json({ error: err.message })
  }
}

// Subir imagen de mensaje
const subirMensaje = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' })
    const url = await subirArchivo(req.file.buffer, 'msg', 'mensajes', req.file.mimetype)
    res.json({ url })
  } catch (err) {
    console.log('ERROR MENSAJE:', err)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { subirAvatar, subirPublicacion, subirMensaje }

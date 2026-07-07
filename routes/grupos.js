const express = require('express')
const router = express.Router()
const {
  getGrupos, crearGrupo, actualizarGrupo,
  unirseGrupo, salirGrupo, transferirAdmin, eliminarGrupo, getMiembros, eliminarMiembro, invitarAlGrupo,
  getPublicacionesGrupo, crearPublicacionGrupo, eliminarPublicacionGrupo
} = require('../controllers/gruposController')
const verifyToken = require('../middlewares/verifyToken')

router.get('/', verifyToken, getGrupos)
router.post('/', verifyToken, crearGrupo)
router.put('/:id', verifyToken, actualizarGrupo)
router.delete('/:id', verifyToken, eliminarGrupo)
router.post('/:id/unirse', verifyToken, unirseGrupo)
router.post('/:id/salir', verifyToken, salirGrupo)
router.get('/:id/miembros', verifyToken, getMiembros)
router.delete('/:id/miembros/:usuarioId', verifyToken, eliminarMiembro)
router.put('/:id/miembros/:usuarioId/admin', verifyToken, transferirAdmin)
router.post('/:id/invitar', verifyToken, invitarAlGrupo)
router.get('/:id/publicaciones', verifyToken, getPublicacionesGrupo)
router.post('/:id/publicaciones', verifyToken, crearPublicacionGrupo)
router.delete('/:id/publicaciones/:pubId', verifyToken, eliminarPublicacionGrupo)

module.exports = router
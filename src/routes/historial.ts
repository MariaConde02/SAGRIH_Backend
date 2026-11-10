import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getConsumoSemanal,
  getMesesRiegos,
  getHistorialRiegos,
  getHistorialClima,
  getHistorialSuelo,
  getMantenimiento,
  programarMantenimiento,
  toggleMantenimiento,
} from '../controllers/historial.controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/consumo-semanal', getConsumoSemanal);
router.get('/riegos/meses', getMesesRiegos);
router.get('/riegos', getHistorialRiegos);
router.get('/clima', getHistorialClima);
router.get('/suelo', getHistorialSuelo);
router.get('/mantenimiento', getMantenimiento);
router.post('/mantenimiento/programar', programarMantenimiento);
router.put('/mantenimiento/:id/toggle', toggleMantenimiento);

export default router;

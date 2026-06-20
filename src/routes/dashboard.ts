import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();
router.use(authMiddleware);

router.get('/dashboard/tendencia-anual', dashboardController.obtenerTendenciaAnual);
router.get('/dashboard/tendencia-mensual', dashboardController.obtenerTendenciaMensual);
router.get('/dashboard/eficiencia', dashboardController.obtenerEficiencia);

export default router;

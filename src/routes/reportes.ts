import { Router } from 'express';
import { getReporteDiario, postCierreDiarioManual } from '../controllers/reportes.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// Endpoint analítico de Cierre Diario
router.get('/diario', getReporteDiario);

// Endpoint de despacho manual del Cierre Diario (Fase 2B)
router.post('/cierre-manual', postCierreDiarioManual);

export default router;

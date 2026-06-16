import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as sensoresController from '../controllers/sensoresController.js';

const router = Router();
router.use(authMiddleware);

router.get('/tanque', sensoresController.obtenerNivel);
router.get('/sensores/ambiente', sensoresController.obtenerAmbiente);
router.get('/sensores/red', sensoresController.obtenerRed);
router.post('/sensores/lecturas', sensoresController.insertarLecturas);

export default router;

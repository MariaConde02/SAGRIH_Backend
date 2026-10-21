import { Router } from 'express';
import { authMiddleware, checkRole } from '../middleware/auth.js';
import { validarEspacialCantero } from '../middleware/validarEspacialCantero.js';
import { CanterosController } from '../controllers/canterosController.js';

const router = Router();
router.use(authMiddleware);

router.get('/', CanterosController.getCanteros);
router.get('/cultivos/lista', CanterosController.getCultivos);
router.post('/', checkRole(['Administrador', 'Supervisor']), validarEspacialCantero, CanterosController.createCantero);
router.patch('/:id', checkRole(['Administrador', 'Supervisor']), CanterosController.updateCantero);
router.delete('/:id', checkRole(['Administrador', 'Supervisor']), CanterosController.deleteCantero);

export default router;

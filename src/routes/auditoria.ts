import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { AuditoriaService } from '../services/auditoriaService.js';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req: any, res) => {
  try {
    const { accion, detalle } = req.body;
    const userId = req.user?.id;

    await AuditoriaService.registrar(userId || null, accion, detalle || null);
    
    res.status(201).json({ success: true });
  } catch (error: any) {
    if (error.message.includes('requerida')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error al registrar auditoría:', error.message);
    res.status(500).json({ error: 'Error interno al registrar auditoría' });
  }
});

router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const formatted = await AuditoriaService.obtenerActividadUsuario(userId);
    res.json(formatted);
  } catch (error: any) {
    console.error('Error al obtener actividad del usuario:', error.message);
    res.status(500).json({ error: 'Error interno al obtener actividad' });
  }
});

router.get('/', async (req: any, res) => {
  try {
    const rol = req.user?.rolNombre;
    const rolId = req.user?.rolId;
    
    // Check by name or by ID (in case token is old)
    const isAuthorized = rol === 'Ingeniero' || rol === 'Administrador' || rolId === 1 || rolId === 2;
    
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de Ingeniero o Administrador.' });
    }

    const formatted = await AuditoriaService.obtenerBitacoraGlobal();
    res.json(formatted);
  } catch (error: any) {
    console.error('Error al obtener auditoría:', error.message);
    res.status(500).json({ error: 'Error interno al obtener auditoría' });
  }
});

export default router;

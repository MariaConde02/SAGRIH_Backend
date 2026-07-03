import { Router } from 'express';
import { authMiddleware, checkRole } from '../middleware/auth.js';
import { RiegoService } from '../services/riegoService.js';

const router = Router();
router.use(authMiddleware);

router.get('/estadisticas', async (req, res) => {
  try {
    const data = await RiegoService.getEstadisticas();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estadísticas' });
  }
});

router.post('/emergencia', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const data = await RiegoService.ejecutarEmergencia(userId);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar emergencia' });
  }
});

router.get('/programas', async (req, res) => {
  try {
    const { invernaderoId } = req.query;
    const data = await RiegoService.getProgramas(invernaderoId as string);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener programas' });
  }
});

router.post('/programas', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { canteroId, dias, hora, duracion } = req.body;
    if (!canteroId || !dias || dias.length === 0 || !hora || !duracion) {
      return res.status(400).json({ error: 'Cantero, días, hora y duración requeridos' });
    }
    const data = await RiegoService.crearPrograma(canteroId, dias, hora, duracion);
    res.status(201).json(data);
  } catch (error: any) {
    const isConflict = error.message.includes('Horario no disponible') || error.message.includes('inválido') || error.message.includes('eliminado/inactivo') || error.message.includes('sin cultivo asignado');
    res.status(isConflict ? 409 : 500).json({ error: error.message || 'Error interno al crear programa de riego' });
  }
});

router.patch('/programas/:canteroId/:progId/estado', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const numericId = parseInt(req.params.progId.replace('prog-', ''), 10);
    const { activo } = req.body;
    const data = await RiegoService.cambiarEstadoPrograma(req.params.canteroId, numericId, activo);
    res.json(data);
  } catch (error: any) {
    const status = error.message.includes('no encontrado') ? 404 : error.message.includes('ejecucion') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Error al cambiar estado de programa' });
  }
});

router.delete('/programas/:canteroId/:progId', checkRole(['Administrador']), async (req, res) => {
  try {
    const numericId = parseInt(req.params.progId.replace('prog-', ''), 10);
    const data = await RiegoService.eliminarPrograma(req.params.canteroId, numericId);
    res.json(data);
  } catch (error: any) {
    const status = error.message.includes('no encontrado') ? 404 : error.message.includes('ejecución') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Error al eliminar programa' });
  }
});

router.get('/historial', async (_req, res) => {
  try {
    const data = await RiegoService.getHistorial();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener historial' });
  }
});

router.get('/bomba', async (_req, res) => {
  try {
    const data = await RiegoService.getEstadoBomba();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estado de bomba' });
  }
});

router.post('/bomba', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { activa } = req.body;
    const data = await RiegoService.toggleBomba(userId, activa);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al cambiar estado de bomba' });
  }
});

router.post('/ejecutar', checkRole(['Administrador', 'Supervisor']), async (req: any, res) => {
  try {
    const { canteroId, duracion, litros } = req.body;
    if (!canteroId) return res.status(400).json({ error: 'Cantero requerido' });
    const data = await RiegoService.ejecutarRiegoManual(req.user.id, canteroId, duracion, litros);
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al ejecutar riego' });
  }
});

router.post('/detener', checkRole(['Administrador', 'Supervisor']), async (req: any, res) => {
  try {
    const { canteroId } = req.body;
    if (!canteroId) return res.status(400).json({ error: 'Cantero requerido' });
    const data = await RiegoService.detenerRiegoManual(req.user.id, canteroId);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al detener riego' });
  }
});

router.get('/metricas', async (req, res) => {
  try {
    const data = await RiegoService.getMetricas();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener métricas' });
  }
});

export default router;

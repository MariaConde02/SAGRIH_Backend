import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const alertas = await prisma.tt_alert.findMany({
      include: {
        tm_tipal: true,
        tt_dispo: true
      },
      orderBy: { alert_fd: 'desc' },
      take: 50
    });
    
    res.json(alertas.map(r => ({
      id: r.alert_id,
      tipo: r.tm_tipal?.tipal_nm || 'info',
      titulo: r.alert_ti,
      origen: r.tt_dispo?.dispo_tg || 'Sistema',
      fecha: r.alert_fd,
      estado: r.alert_ea,
      icono: r.tm_tipal?.tipal_nm === 'crítica' ? 'alert-circle' : r.tm_tipal?.tipal_nm === 'media' ? 'alert-triangle' : 'info',
    })));
  } catch (error: any) {
    console.error('Error al listar alertas:', error.message);
    res.json([]);
  }
});

router.put('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    const valid = ['activa', 'atendida', 'resuelta', 'Pendiente', 'En revisión'];
    if (!valid.includes(estado)) return res.status(400).json({ error: `Estado inválido` });
    
    const result = await prisma.tt_alert.update({
      where: { alert_id: parseInt(req.params.id, 10) },
      data: { alert_ea: estado }
    });
    
    res.json({ id: result.alert_id, estado });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    console.error('Error al actualizar alerta:', error.message);
    res.status(500).json({ error: 'Error al actualizar alerta' });
  }
});

export default router;

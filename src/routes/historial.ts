import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

router.get('/consumo-semanal', async (_req, res) => {
  try {
    const result = await prisma.$queryRaw<any[]>`
       SELECT DATE(RIHRI_FI) AS fecha, SUM(RIHRI_VL) AS litros
       FROM TH_RIHRI WHERE RIHRI_FI >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(RIHRI_FI)
       ORDER BY DATE(RIHRI_FI)
    `;
    const map = {};
    for (const r of result) {
      const d = new Date(r.fecha);
      map[DIAS[d.getDay()]] = r.litros;
    }
    res.json(DIAS.map(d => ({ dia: d, litros: Number(map[d]) || 0 })));
  } catch (error: any) {
    console.error('Error en consumo-semanal:', error.message);
    res.json(DIAS.map(d => ({ dia: d, litros: 0 })));
  }
});

router.get('/riegos', async (_req, res) => {
  try {
    const riegos = await prisma.th_rihri.findMany({
      include: {
        tm_cante: true,
        tm_usuar: true
      },
      orderBy: { rihri_fi: 'desc' },
      take: 100
    });
    
    res.json(riegos.map(r => ({
      id: r.rihri_id,
      fecha: r.rihri_fi,
      cantero: r.tm_cante?.cante_nm,
      litros: r.rihri_vl,
      usuario: r.tm_usuar?.usuar_nm || r.rihri_ta,
      tipo: r.rihri_ta,
    })));
  } catch (error: any) {
    console.error('Error en historial riegos:', error.message);
    res.json([]);
  }
});

router.get('/mantenimiento', async (_req, res) => {
  try {
    const mantenimientos = await prisma.th_mante.findMany({
      include: {
        tt_dispo: true,
        tm_usuar: true
      },
      orderBy: { mante_fe: 'desc' },
      take: 50
    });
    
    res.json(mantenimientos.map(r => ({
      id: r.mante_id,
      fecha: r.mante_fe,
      tarea: r.mante_ta,
      asignado: r.tm_usuar?.usuar_nm,
      estado: r.mante_re ? 'completada' : 'pendiente',
      prioridad: 'media',
      observaciones: r.mante_ob,
      dispositivoId: r.dispo_id,
    })));
  } catch (error: any) {
    console.error('Error en mantenimiento:', error.message);
    res.json([]);
  }
});

router.put('/mantenimiento/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.th_mante.findUnique({
      where: { mante_id: id },
      select: { mante_re: true }
    });
    
    if (!existing) return res.status(404).json({ error: 'No encontrada' });
    
    const updated = await prisma.th_mante.update({
      where: { mante_id: id },
      data: { mante_re: !existing.mante_re }
    });
    
    res.json({ id: updated.mante_id, realizada: updated.mante_re });
  } catch (error: any) {
    console.error('Error al toggle mantenimiento:', error.message);
    res.status(500).json({ error: 'Error al actualizar mantenimiento' });
  }
});

export default router;

import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const logs = await prisma.tt_logco.findMany({
      include: {
        tt_dispo: true
      },
      orderBy: { logco_fh: 'desc' },
      take: 100
    });
    
    res.json(logs.map(r => ({
      id: r.logco_id,
      fecha: r.logco_fh,
      evento: r.logco_ev,
      dispositivo: r.tt_dispo?.dispo_tg || 'Sistema',
      modulo: 'Conectividad',
    })));
  } catch (error: any) {
    console.error('Error al listar bitácora:', error.message);
    res.json([]);
  }
});

router.get('/modulos', async (_req, res) => {
  try {
    const logs = await prisma.tt_logco.findMany({
      select: { logco_ev: true },
      distinct: ['logco_ev'],
      orderBy: { logco_ev: 'asc' }
    });
    
    res.json(['Conectividad', ...logs.map(r => r.logco_ev)]);
  } catch (error: any) {
    console.error('Error al listar módulos:', error.message);
    res.json(['Conectividad']);
  }
});

export default router;

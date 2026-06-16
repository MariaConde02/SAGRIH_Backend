import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT l.*, d.DISPO_TG AS dispositivo FROM TT_LOGCO l
     LEFT JOIN TT_DISPO d ON d.DISPO_ID = l.DISPO_ID
     ORDER BY l.LOGCO_FH DESC LIMIT 100`
  );
  res.json(result.rows.map(r => ({
    id: r.logco_id, fecha: r.logco_fh, evento: r.logco_ev,
    dispositivo: r.dispositivo || 'Sistema', modulo: 'Conectividad',
  })));
});

router.get('/modulos', async (_req, res) => {
  const result = await query('SELECT DISTINCT LOGCO_EV FROM TT_LOGCO ORDER BY LOGCO_EV');
  res.json(['Conectividad', ...result.rows.map(r => r.logco_ev)]);
});

export default router;

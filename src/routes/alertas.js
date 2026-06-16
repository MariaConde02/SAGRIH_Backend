import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT a.*, t.TIPAL_NM, d.DISPO_TG FROM TT_ALERT a
     LEFT JOIN TM_TIPAL t ON t.TIPAL_ID = a.TIPAL_ID
     LEFT JOIN TT_DISPO d ON d.DISPO_ID = a.DISPO_ID
     ORDER BY a.ALERT_FD DESC LIMIT 50`
  );
  res.json(result.rows.map(r => ({
    id: r.alert_id, tipo: r.tipal_nm || 'info', titulo: r.alert_ti,
    origen: r.dispo_tg || 'Sistema', fecha: r.alert_fd, estado: r.alert_ea,
    icono: r.tipal_nm === 'crítica' ? 'alert-circle' : r.tipal_nm === 'media' ? 'alert-triangle' : 'info',
  })));
});

router.put('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  const valid = ['activa', 'atendida', 'resuelta', 'Pendiente', 'En revisión'];
  if (!valid.includes(estado)) return res.status(400).json({ error: `Estado inválido` });
  const result = await query('UPDATE TT_ALERT SET ALERT_EA=$1 WHERE ALERT_ID=$2 RETURNING ALERT_ID', [estado, req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });
  res.json({ id: result.rows[0].alert_id, estado });
});

export default router;

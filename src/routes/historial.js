import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/consumo-semanal', async (_req, res) => {
  const result = await query(
    `SELECT DATE(RIHRI_FI) AS fecha, SUM(RIHRI_VL) AS litros
     FROM TH_RIHRI WHERE RIHRI_FI >= CURRENT_DATE - INTERVAL '7 days'
     GROUP BY DATE(RIHRI_FI)
     ORDER BY DATE(RIHRI_FI)`
  );
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const map = {};
  for (const r of result.rows) {
    const d = new Date(r.fecha);
    map[diasSemana[d.getDay()]] = r.litros;
  }
  res.json(diasSemana.map(d => ({ dia: d, litros: Number(map[d]) || 0 })));
});

router.get('/riegos', async (_req, res) => {
  const result = await query(
    `SELECT h.*, c.CANTE_NM, u.USUAR_NM FROM TH_RIHRI h
     LEFT JOIN TM_CANTE c ON c.CANTE_ID = h.CANTE_ID
     LEFT JOIN TM_USUAR u ON u.USUAR_ID = h.USUAR_ID
     ORDER BY h.RIHRI_FI DESC LIMIT 100`
  );
  res.json(result.rows.map(r => ({
    id: r.rihri_id, fecha: r.rihri_fi, cantero: r.cante_nm,
    litros: r.rihri_vl, usuario: r.usuar_nm || r.rihri_ta, tipo: r.rihri_ta,
  })));
});

router.get('/mantenimiento', async (_req, res) => {
  const result = await query(
    `SELECT m.*, d.DISPO_ID, u.USUAR_NM FROM TH_MANTE m
     LEFT JOIN TT_DISPO d ON d.DISPO_ID = m.DISPO_ID
     LEFT JOIN TM_USUAR u ON u.USUAR_ID = m.USUAR_ID
     ORDER BY m.MANTE_FE DESC LIMIT 50`
  );
  res.json(result.rows.map(r => ({
    id: r.mante_id, fecha: r.mante_fe, tarea: r.mante_ta,
    asignado: r.usuar_nm, estado: r.mante_re ? 'completada' : 'pendiente',
    prioridad: 'media', observaciones: r.mante_ob, dispositivoId: r.dispo_id,
  })));
});

router.put('/mantenimiento/:id/toggle', async (req, res) => {
  const result = await query('UPDATE TH_MANTE SET MANTE_RE = NOT MANTE_RE WHERE MANTE_ID = $1 RETURNING MANTE_ID, MANTE_RE', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
  res.json({ id: result.rows[0].mante_id, realizada: result.rows[0].mante_re });
});

export default router;

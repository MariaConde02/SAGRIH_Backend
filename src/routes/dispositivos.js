import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT d.*, t.TIPOD_NM, c.CANTE_NM FROM TT_DISPO d
     LEFT JOIN TM_TIPOD t ON t.TIPOD_ID = d.TIPOD_ID
     LEFT JOIN TM_CANTE c ON c.CANTE_ID = d.CANTE_ID
     ORDER BY d.DISPO_ID`
  );
  res.json(result.rows.map(r => ({
    id: r.dispo_id, tipo: r.tipod_nm, modelo: r.dispo_tg,
    asignacion: r.cante_nm, estado: r.dispo_et, invernaderoId: r.inver_id, simulado: r.dispo_sm,
  })));
});

router.get('/tipos', async (_req, res) => {
  const result = await query('SELECT * FROM TM_TIPOD ORDER BY TIPOD_ID');
  res.json(result.rows.map(r => ({ id: r.tipod_id, nombre: r.tipod_nm })));
});

router.get('/:id/lecturas', async (req, res) => {
  const result = await query(
    `SELECT l.LECTU_ID, l.LECTU_VL, l.LECTU_FH, u.UNIDM_AB
     FROM TT_LECTU l LEFT JOIN TM_UNIDM u ON u.UNIDM_ID = l.UNIDM_ID
     WHERE l.DISPO_ID = $1 ORDER BY l.LECTU_FH DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(result.rows.map(r => ({ id: r.lectu_id, valor: r.lectu_vl, unidad: r.unidm_ab, fecha: r.lectu_fh })));
});

router.post('/', async (req, res) => {
  const { id, tipoId, modelo, canteroId, invernaderoId, estado } = req.body;
  if (!id || !tipoId) return res.status(400).json({ error: 'ID y tipo requeridos' });
  await query(
    'INSERT INTO TT_DISPO (DISPO_ID, DISPO_TG, TIPOD_ID, CANTE_ID, INVER_ID, DISPO_ET) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, modelo || null, tipoId, canteroId || null, invernaderoId || 'INV-MAESTRO', estado || 'Operativo']);
  res.status(201).json({ id });
});

router.put('/:id', async (req, res) => {
  const { tipoId, modelo, canteroId, estado } = req.body;
  await query(
    'UPDATE TT_DISPO SET TIPOD_ID=COALESCE($1,TIPOD_ID), DISPO_TG=COALESCE($2,DISPO_TG), CANTE_ID=$3, DISPO_ET=COALESCE($4,DISPO_ET) WHERE DISPO_ID=$5',
    [tipoId, modelo, canteroId || null, estado, req.params.id]);
  res.json({ message: 'Dispositivo actualizado' });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM TT_DISPO WHERE DISPO_ID=$1', [req.params.id]);
  res.json({ success: true });
});

export default router;

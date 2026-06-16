import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const result = await query('SELECT * FROM TM_INVER ORDER BY INVER_MA DESC, INVER_ID');
  res.json(result.rows.map(r => ({
    id: r.inver_id, nombre: r.inver_nm, ubicacion: r.inver_ub,
    estado: r.inver_est, isMaestro: r.inver_ma, ancho: r.inver_an,
    largo: r.inver_la, pasillo: r.inver_pa,
  })));
});

router.get('/maestro', async (_req, res) => {
  const result = await query('SELECT * FROM TM_INVER WHERE INVER_MA = TRUE LIMIT 1');
  if (result.rows.length === 0) return res.status(404).json({ error: 'Invernadero Maestro no encontrado' });
  const r = result.rows[0];
  res.json({ id: r.inver_id, nombre: r.inver_nm, ubicacion: r.inver_ub, estado: r.inver_est, isMaestro: r.inver_ma });
});

router.get('/:id', async (req, res) => {
  const result = await query('SELECT * FROM TM_INVER WHERE INVER_ID = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Invernadero no encontrado' });
  const r = result.rows[0];
  res.json({ id: r.inver_id, nombre: r.inver_nm, ubicacion: r.inver_ub, estado: r.inver_est, isMaestro: r.inver_ma });
});

router.post('/', async (req, res) => {
  const { id, nombre, ubicacion } = req.body;
  if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre requeridos' });
  await query('INSERT INTO TM_INVER (INVER_ID, INVER_NM, INVER_UB) VALUES ($1,$2,$3)', [id, nombre, ubicacion || null]);
  res.status(201).json({ id, nombre });
});

router.put('/:id', async (req, res) => {
  const { nombre, ubicacion, estado, ancho, largo, pasillo } = req.body;
  await query(
    `UPDATE TM_INVER SET INVER_NM=COALESCE($1,INVER_NM), INVER_UB=COALESCE($2,INVER_UB),
     INVER_EST=COALESCE($3,INVER_EST), INVER_AN=COALESCE($4,INVER_AN),
     INVER_LA=COALESCE($5,INVER_LA), INVER_PA=COALESCE($6,INVER_PA)
     WHERE INVER_ID=$7`,
    [nombre, ubicacion, estado, ancho, largo, pasillo, req.params.id]);
  res.json({ message: 'Invernadero actualizado' });
});

router.delete('/:id', async (req, res) => {
  const check = await query('SELECT INVER_MA FROM TM_INVER WHERE INVER_ID=$1', [req.params.id]);
  if (check.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
  if (check.rows[0].inver_ma) return res.status(403).json({ error: 'No se puede eliminar el Invernadero Maestro' });
  await query('DELETE FROM TM_INVER WHERE INVER_ID=$1', [req.params.id]);
  res.json({ success: true });
});

export default router;

import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT c.*, cu.CULTI_NM, cu.CULTI_MI, cu.CULTI_MA
       FROM TM_CANTE c LEFT JOIN TM_CULTI cu ON cu.CULTI_ID = c.CULTI_ID
       ORDER BY c.CANTE_ID`
    );
    res.json(result.rows.map(r => ({
      id: r.cante_id, nombre: r.cante_nm, cultivo: r.culti_nm,
      umbralMin: r.cante_mi || r.culti_mi, umbralMax: r.cante_ma || r.culti_ma,
      invernaderoId: r.inver_id,
      estado: r.cante_est || 'Activo',
    })));
  } catch (error) {
    console.error('Error al obtener canteros:', error);
    res.status(500).json({ error: 'Error al obtener canteros' });
  }
});

router.get('/cultivos/lista', async (_req, res) => {
  const result = await query('SELECT CULTI_ID, CULTI_NM, CULTI_MI, CULTI_MA FROM TM_CULTI ORDER BY CULTI_NM');
  res.json(result.rows.map(r => ({ id: r.culti_id, nombre: r.culti_nm, umbralMin: r.culti_mi, umbralMax: r.culti_ma })));
});

router.post('/', async (req, res) => {
  try {
    const { id, nombre, cultivoId, invernaderoId } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre requeridos' });
    await query('INSERT INTO TM_CANTE (CANTE_ID, CANTE_NM, INVER_ID, CULTI_ID) VALUES ($1,$2,$3,$4)',
      [id, nombre, invernaderoId || 'INV-MAESTRO', cultivoId || null]);
    res.status(201).json({ id, nombre });
  } catch (error) {
    console.error('Error al crear cantero:', error);
    res.status(500).json({ error: 'Error al crear cantero' });
  }
});

router.put('/:id', async (req, res) => {
  const { nombre, cultivoId, umbralMin, umbralMax, invernaderoId, estado } = req.body;
  await query(
    `UPDATE TM_CANTE SET CANTE_NM=COALESCE($1,CANTE_NM), CULTI_ID=$2, CANTE_MI=$3, CANTE_MA=$4, INVER_ID=COALESCE($5,INVER_ID), CANTE_EST=$7
     WHERE CANTE_ID=$6`,
    [nombre, cultivoId, umbralMin, umbralMax, invernaderoId, req.params.id, estado]);

  // Si el cantero queda inactivo (estado='Inactivo' o sin cultivo), eliminar sus programas de riego
  const check = await query('SELECT CANTE_EST, CULTI_ID FROM TM_CANTE WHERE CANTE_ID = $1', [req.params.id]);
  if (check.rows.length > 0) {
    const r = check.rows[0];
    if (r.cante_est === 'Inactivo' || r.culti_id === null) {
      await query('DELETE FROM TT_PROGR WHERE CANTE_ID = $1', [req.params.id]);
    }
  }

  res.json({ message: 'Cantero actualizado' });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM TM_CANTE WHERE CANTE_ID=$1', [req.params.id]);
  res.json({ success: true });
});

export default router;

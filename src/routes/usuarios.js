import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT u.*, r.ROLES_NM FROM TM_USUAR u LEFT JOIN TM_ROLES r ON r.ROLES_ID = u.ROLES_ID ORDER BY u.USUAR_ID`
  );
  res.json(result.rows.map(r => ({
    id: r.usuar_id, nombre: `${r.usuar_nm} ${r.usuar_ap || ''}`.trim(),
    email: r.usuar_em, rol: r.roles_nm, estado: r.usuar_est, ultimoAcceso: r.usuar_at,
  })));
});

router.get('/roles', async (_req, res) => {
  const result = await query('SELECT * FROM TM_ROLES ORDER BY ROLES_ID');
  res.json(result.rows.map(r => ({ id: r.roles_id, nombre: r.roles_nm, descripcion: r.roles_ds })));
});

router.get('/permisos', async (_req, res) => {
  const result = await query('SELECT * FROM TM_PERMI ORDER BY PERMI_ID');
  res.json(result.rows.map(r => ({ id: r.permi_id, nombre: r.permi_nm, descripcion: r.permi_ds })));
});

router.post('/', async (req, res) => {
  const { nombre, apellido, email, password, rolId, medioNotificacion } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña requeridos' });
  const exists = await query('SELECT 1 FROM TM_USUAR WHERE USUAR_EM = $1', [email]);
  if (exists.rows.length > 0) return res.status(409).json({ error: 'El email ya está registrado' });
  const hashed = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO TM_USUAR (USUAR_NM, USUAR_AP, USUAR_EM, USUAR_PW, ROLES_ID, USUAR_MN) VALUES ($1,$2,$3,$4,$5,$6) RETURNING USUAR_ID',
    [nombre, apellido || null, email, hashed, rolId || 3, medioNotificacion || 'email']);
  res.status(201).json({ id: result.rows[0].usuar_id });
});

router.put('/:id', async (req, res) => {
  const { nombre, apellido, email, password, rolId, estado, medioNotificacion } = req.body;
  let pwClause = '';
  const params = [nombre, apellido, email, rolId, estado, medioNotificacion, req.params.id];
  if (password) {
    const hashed = await bcrypt.hash(password, 10);
    params.push(hashed);
    pwClause = ', USUAR_PW = $8';
  }
  await query(
    `UPDATE TM_USUAR SET USUAR_NM=COALESCE($1,USUAR_NM), USUAR_AP=COALESCE($2,USUAR_AP),
     USUAR_EM=COALESCE($3,USUAR_EM), ROLES_ID=COALESCE($4,ROLES_ID),
     USUAR_EST=COALESCE($5,USUAR_EST), USUAR_MN=COALESCE($6,USUAR_MN)${pwClause}
     WHERE USUAR_ID=$7`, params);
  res.json({ message: 'Usuario actualizado' });
});

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM TM_USUAR WHERE USUAR_ID=$1', [req.params.id]);
  res.json({ success: true });
});

export default router;

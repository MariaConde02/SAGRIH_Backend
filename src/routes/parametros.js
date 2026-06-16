import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const STRUCTURE = {
  humedad: { minimoCritico: 'HUMEDAD_MIN_CRITICO', optimoInferior: 'HUMEDAD_OPTIMO_INFERIOR', optimoSuperior: 'HUMEDAD_OPTIMO_SUPERIOR' },
  riego: { duracionDefecto: 'RIEGO_DURACION_DEFECTO', caudalNominal: 'RIEGO_CAUDAL_NOMINAL', tiempoEntreRiegos: 'RIEGO_TIEMPO_ENTRE' },
  tanque: { capacidad: 'TANQUE_CAPACIDAD', alertaBaja: 'TANQUE_ALERTA_BAJA', alertaCritica: 'TANQUE_ALERTA_CRITICA' },
  comunicacion: { intervaloLectura: 'COMUNICACION_INTERVALO', timeoutSensor: 'COMUNICACION_TIMEOUT', reintentos: 'COMUNICACION_REINTENTOS' },
};

const DEFAULTS = {
  HUMEDAD_MIN_CRITICO: '35', HUMEDAD_OPTIMO_INFERIOR: '55', HUMEDAD_OPTIMO_SUPERIOR: '85',
  RIEGO_DURACION_DEFECTO: '10', RIEGO_CAUDAL_NOMINAL: '1.2', RIEGO_TIEMPO_ENTRE: '6',
  TANQUE_CAPACIDAD: '10000', TANQUE_ALERTA_BAJA: '20', TANQUE_ALERTA_CRITICA: '10',
  COMUNICACION_INTERVALO: '5', COMUNICACION_TIMEOUT: '30', COMUNICACION_REINTENTOS: '3',
};

function structure(flat) {
  const s = {};
  for (const [group, fields] of Object.entries(STRUCTURE)) {
    s[group] = {};
    for (const [key, cl] of Object.entries(fields)) s[group][key] = flat[cl] ? Number(flat[cl]) : null;
  }
  return s;
}

router.get('/', async (_req, res) => {
  const result = await query('SELECT PARAM_CL, PARAM_VL FROM TP_PARAM ORDER BY PARAM_ID');
  const flat = {};
  for (const r of result.rows) flat[r.param_cl] = r.param_vl;
  res.json(structure(flat));
});

router.put('/', async (req, res) => {
  const flat = {};
  for (const [group, fields] of Object.entries(req.body)) {
    for (const [key, value] of Object.entries(fields)) {
      const cl = STRUCTURE[group]?.[key];
      if (cl) flat[cl] = String(value);
    }
  }
  for (const [cl, vl] of Object.entries(flat)) {
    await query(
      `INSERT INTO TP_PARAM (PARAM_CL, PARAM_VL, PARAM_UM) VALUES ($1,$2,CURRENT_TIMESTAMP)
       ON CONFLICT (PARAM_CL) DO UPDATE SET PARAM_VL=$2, PARAM_UM=CURRENT_TIMESTAMP`, [cl, vl]);
  }
  const result = await query('SELECT PARAM_CL, PARAM_VL FROM TP_PARAM ORDER BY PARAM_ID');
  const flat2 = {};
  for (const r of result.rows) flat2[r.param_cl] = r.param_vl;
  res.json(structure(flat2));
});

router.post('/reset', async (_req, res) => {
  for (const [cl, vl] of Object.entries(DEFAULTS)) {
    await query(
      `INSERT INTO TP_PARAM (PARAM_CL, PARAM_VL, PARAM_UM) VALUES ($1,$2,CURRENT_TIMESTAMP)
       ON CONFLICT (PARAM_CL) DO UPDATE SET PARAM_VL=$2, PARAM_UM=CURRENT_TIMESTAMP`, [cl, vl]);
  }
  res.json({ message: 'Parámetros restablecidos' });
});

export default router;

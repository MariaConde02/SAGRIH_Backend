import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const STRUCTURE: any = {
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

function structure(flat: any) {
  const s: any = {};
  for (const [group, fields] of Object.entries(STRUCTURE)) {
    s[group] = {};
    for (const [key, cl] of Object.entries(fields as any)) {
      s[group][key] = flat[cl as string] ? Number(flat[cl as string]) : null;
    }
  }
  return s;
}

router.get('/', async (_req, res) => {
  try {
    const params = await prisma.tp_param.findMany({
      orderBy: { param_id: 'asc' }
    });
    
    const flat: any = {};
    for (const r of params) flat[r.param_cl] = r.param_vl;
    
    res.json(structure(flat));
  } catch (error: any) {
    console.error('Error al obtener parámetros:', error.message);
    res.json({ humedad: {}, riego: {}, tanque: {}, comunicacion: {} });
  }
});

router.put('/', async (req, res) => {
  try {
    const flat: any = {};
    for (const [group, fields] of Object.entries(req.body)) {
      for (const [key, value] of Object.entries(fields as any)) {
        const cl = STRUCTURE[group]?.[key];
        if (cl) flat[cl] = String(value);
      }
    }
    
    for (const [cl, vl] of Object.entries(flat)) {
      await prisma.tp_param.upsert({
        where: { param_cl: cl as string },
        update: { param_vl: vl as string, param_um: new Date() },
        create: { param_cl: cl as string, param_vl: vl as string, param_um: new Date() }
      });
    }
    
    const params = await prisma.tp_param.findMany({
      orderBy: { param_id: 'asc' }
    });
    const flat2: any = {};
    for (const r of params) flat2[r.param_cl] = r.param_vl;
    
    res.json(structure(flat2));
  } catch (error: any) {
    console.error('Error al actualizar parámetros:', error.message);
    res.status(500).json({ error: 'Error al actualizar parámetros' });
  }
});

router.post('/reset', async (_req, res) => {
  try {
    for (const [cl, vl] of Object.entries(DEFAULTS)) {
      await prisma.tp_param.upsert({
        where: { param_cl: cl },
        update: { param_vl: vl, param_um: new Date() },
        create: { param_cl: cl, param_vl: vl, param_um: new Date() }
      });
    }
    res.json({ message: 'Parámetros restablecidos' });
  } catch (error: any) {
    console.error('Error al restablecer parámetros:', error.message);
    res.status(500).json({ error: 'Error al restablecer parámetros' });
  }
});

export default router;

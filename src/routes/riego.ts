import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const DAY_MAP: any = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 7 };
const REV_DAY_MAP: any = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

router.get('/programas', async (_req, res) => {
  try {
    const progResult = await prisma.tt_progr.findMany({
      include: {
        tt_progd: {
          orderBy: { progd_da: 'asc' }
        }
      },
      orderBy: [
        { cante_id: 'asc' },
        { progr_hi: 'asc' }
      ]
    });
    
    const programas: any = {};
    for (const prog of progResult) {
      const dias = prog.tt_progd.map(r => REV_DAY_MAP[r.progd_da]);
      if (!programas[prog.cante_id]) programas[prog.cante_id] = [];
      
      const hora = prog.progr_hi.toISOString().substring(11, 16);
      
      programas[prog.cante_id].push({
        id: `prog-${prog.progr_id}`,
        dias,
        hora,
        duracion: prog.progr_dr,
        activo: prog.progr_at,
      });
    }
    res.json(programas);
  } catch (error) {
    console.error('Error al obtener programas:', error);
    res.status(500).json({ error: 'Error al obtener programas de riego' });
  }
});

router.post('/programas', async (req, res) => {
  try {
    const { canteroId, dias, hora, duracion } = req.body;
    if (!canteroId || !dias || dias.length === 0 || !hora || !duracion) {
      return res.status(400).json({ error: 'Cantero, días, hora y duración requeridos' });
    }
    const validDias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    for (const d of dias) {
      if (!validDias.includes(d)) return res.status(400).json({ error: `Día inválido: ${d}` });
    }
    
    const cantero = await prisma.tm_cante.findUnique({
      where: { cante_id: canteroId },
      select: { cante_est: true, culti_id: true }
    });
    
    if (!cantero) return res.status(404).json({ error: `Cantero ${canteroId} no encontrado` });
    
    if (cantero.cante_est === 'Inactivo' || cantero.culti_id === null) {
      return res.status(400).json({ error: 'Cantero inactivo. No se pueden asignar programas de riego.' });
    }

    const newStart = timeToMinutes(hora);
    const newEnd = newStart + Number(duracion);
    
    const existing = await prisma.tt_progr.findMany({
      where: { cante_id: canteroId, progr_at: true },
      include: { tt_progd: true }
    });
    
    for (const prog of existing) {
      const progDias = prog.tt_progd.map(r => REV_DAY_MAP[r.progd_da]);
      const sameDays = progDias.some((d: string) => dias.includes(d));
      if (sameDays) {
        const pStart = timeToMinutes(prog.progr_hi.toISOString().substring(11, 16));
        const pEnd = pStart + prog.progr_dr;
        if (newStart < pEnd && newEnd > pStart) {
          return res.status(409).json({ error: 'Horario no disponible. Choca con otro riego programado.' });
        }
      }
    }

    const progHi = new Date(`1970-01-01T${hora}:00.000Z`);
    
    const newProg = await prisma.tt_progr.create({
      data: {
        cante_id: canteroId,
        progr_hi: progHi,
        progr_dr: parseInt(duracion, 10),
        progr_at: true,
        tt_progd: {
          create: dias.map((day: string) => ({ progd_da: DAY_MAP[day] }))
        }
      }
    });
    
    res.status(201).json({ id: `prog-${newProg.progr_id}`, dias, hora, duracion: Number(duracion), activo: true });
  } catch (error) {
    console.error('Error al crear programa:', error);
    res.status(500).json({ error: 'Error al crear programa de riego' });
  }
});

router.delete('/programas/:canteroId/:progId', async (req, res) => {
  try {
    const numericId = parseInt(req.params.progId.replace('prog-', ''), 10);
    
    const result = await prisma.tt_progr.deleteMany({
      where: {
        progr_id: numericId,
        cante_id: req.params.canteroId
      }
    });
    
    if (result.count === 0) return res.status(404).json({ error: 'Programa no encontrado' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar programa:', error);
    res.status(500).json({ error: 'Error al eliminar programa' });
  }
});

router.get('/historial', async (_req, res) => {
  try {
    const historial = await prisma.th_rihri.findMany({
      include: {
        tm_cante: true,
        tm_usuar: true
      },
      orderBy: { rihri_fi: 'desc' },
      take: 50
    });
    
    res.json(historial.map(r => ({
      id: r.rihri_id,
      fecha: r.rihri_fi,
      cantero: r.tm_cante?.cante_nm,
      litros: r.rihri_vl,
      usuario: r.tm_usuar?.usuar_nm || r.rihri_ta,
      tipo: r.rihri_ta,
    })));
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

router.get('/bomba', async (_req, res) => {
  try {
    const param = await prisma.tp_param.findUnique({
      where: { param_cl: 'BOMBA_ACTIVA' }
    });
    const activa = param ? param.param_vl === 'true' : false;
    res.json({ activa });
  } catch (error) {
    console.error('Error al obtener estado de bomba:', error);
    res.status(500).json({ error: 'Error al obtener estado de bomba' });
  }
});

router.post('/bomba', async (req, res) => {
  try {
    const param = await prisma.tp_param.findUnique({
      where: { param_cl: 'BOMBA_ACTIVA' }
    });
    const actual = param ? param.param_vl === 'true' : false;
    let nuevo = req.body.activa;
    if (nuevo === undefined) {
      nuevo = !actual;
    }
    
    await prisma.tp_param.upsert({
      where: { param_cl: 'BOMBA_ACTIVA' },
      update: { param_vl: String(nuevo) },
      create: { param_cl: 'BOMBA_ACTIVA', param_vl: String(nuevo) }
    });
    
    res.json({ activa: nuevo });
  } catch (error) {
    console.error('Error al togglear bomba:', error);
    res.status(500).json({ error: 'Error al cambiar estado de bomba' });
  }
});

router.post('/ejecutar', async (req: any, res) => {
  try {
    const { canteroId, duracion, litros } = req.body;
    if (!canteroId) return res.status(400).json({ error: 'Cantero requerido' });
    
    const d = duracion ? Number(duracion) : 10;
    const ff = new Date(Date.now() + d * 60000);
    
    await prisma.th_rihri.create({
      data: {
        cante_id: canteroId,
        rihri_ta: 'Manual',
        rihri_vl: litros ? Number(litros) : 0,
        rihri_ff: ff,
        usuar_id: req.user?.id || null
      }
    });
    
    res.status(201).json({ success: true, message: 'Riego ejecutado manualmente' });
  } catch (error) {
    console.error('Error al ejecutar riego:', error);
    res.status(500).json({ error: 'Error al ejecutar riego' });
  }
});

export default router;

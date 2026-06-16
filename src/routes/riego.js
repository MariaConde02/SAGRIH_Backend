import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const DAY_MAP = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 7 };
const REV_DAY_MAP = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

router.get('/programas', async (_req, res) => {
  try {
    const progResult = await query(
      `SELECT p.PROGR_ID, p.CANTE_ID, p.PROGR_HI, p.PROGR_DR, p.PROGR_AT
       FROM TT_PROGR p ORDER BY p.CANTE_ID, p.PROGR_HI`
    );
    const programas = {};
    for (const prog of progResult.rows) {
      const diasResult = await query('SELECT PROGD_DA FROM TT_PROGD WHERE PROGR_ID = $1 ORDER BY PROGD_DA', [prog.progr_id]);
      const dias = diasResult.rows.map(r => REV_DAY_MAP[r.progd_da]);
      if (!programas[prog.cante_id]) programas[prog.cante_id] = [];
      programas[prog.cante_id].push({
        id: `prog-${prog.progr_id}`,
        dias,
        hora: prog.progr_hi.substring(0, 5),
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
    const cantero = await query('SELECT CANTE_EST, CULTI_ID FROM TM_CANTE WHERE CANTE_ID = $1', [canteroId]);
    if (cantero.rows.length === 0) return res.status(404).json({ error: `Cantero ${canteroId} no encontrado` });
    const c = cantero.rows[0];
    if (c.cante_est === 'Inactivo' || c.culti_id === null) {
      return res.status(400).json({ error: 'Cantero inactivo. No se pueden asignar programas de riego.' });
    }

    const newStart = timeToMinutes(hora);
    const newEnd = newStart + Number(duracion);
    const existing = await query('SELECT * FROM TT_PROGR WHERE CANTE_ID = $1 AND PROGR_AT = TRUE', [canteroId]);
    for (const prog of existing.rows) {
      const diasResult = await query('SELECT PROGD_DA FROM TT_PROGD WHERE PROGR_ID = $1', [prog.progr_id]);
      const progDias = diasResult.rows.map(r => REV_DAY_MAP[r.progd_da]);
      const sameDays = progDias.some(d => dias.includes(d));
      if (sameDays) {
        const pStart = timeToMinutes(prog.progr_hi.substring(0, 5));
        const pEnd = pStart + prog.progr_dr;
        if (newStart < pEnd && newEnd > pStart) {
          return res.status(409).json({ error: 'Horario no disponible. Choca con otro riego programado.' });
        }
      }
    }

    const progResult = await query(
      `INSERT INTO TT_PROGR (CANTE_ID, PROGR_HI, PROGR_DR, PROGR_AT) VALUES ($1, $2, $3, TRUE) RETURNING PROGR_ID`,
      [canteroId, hora, duracion]
    );
    const progId = progResult.rows[0].progr_id;
    for (const day of dias) {
      await query('INSERT INTO TT_PROGD (PROGR_ID, PROGD_DA) VALUES ($1, $2)', [progId, DAY_MAP[day]]);
    }
    res.status(201).json({ id: `prog-${progId}`, dias, hora, duracion: Number(duracion), activo: true });
  } catch (error) {
    console.error('Error al crear programa:', error);
    res.status(500).json({ error: 'Error al crear programa de riego' });
  }
});

router.delete('/programas/:canteroId/:progId', async (req, res) => {
  try {
    const numericId = req.params.progId.replace('prog-', '');
    const result = await query('DELETE FROM TT_PROGR WHERE PROGR_ID = $1 AND CANTE_ID = $2 RETURNING PROGR_ID', [numericId, req.params.canteroId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Programa no encontrado' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar programa:', error);
    res.status(500).json({ error: 'Error al eliminar programa' });
  }
});

router.get('/historial', async (_req, res) => {
  try {
    const result = await query(
      `SELECT h.RIHRI_ID, h.RIHRI_FI, h.RIHRI_FF, h.RIHRI_VL, h.RIHRI_TA, c.CANTE_NM, u.USUAR_NM
       FROM TH_RIHRI h
       LEFT JOIN TM_CANTE c ON c.CANTE_ID = h.CANTE_ID
       LEFT JOIN TM_USUAR u ON u.USUAR_ID = h.USUAR_ID
       ORDER BY h.RIHRI_FI DESC LIMIT 50`
    );
    res.json(result.rows.map(r => ({
      id: r.rihri_id, fecha: r.rihri_fi, cantero: r.cante_nm,
      litros: r.rihri_vl, usuario: r.usuar_nm || r.rihri_ta, tipo: r.rihri_ta,
    })));
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

router.get('/bomba', async (_req, res) => {
  try {
    const result = await query(
      `SELECT PARAM_VL FROM TP_PARAM WHERE PARAM_CL = 'BOMBA_ACTIVA'`
    );
    const activa = result.rows.length > 0 ? result.rows[0].param_vl === 'true' : false;
    res.json({ activa });
  } catch (error) {
    console.error('Error al obtener estado de bomba:', error);
    res.status(500).json({ error: 'Error al obtener estado de bomba' });
  }
});

router.put('/bomba', async (_req, res) => {
  try {
    const result = await query(
      `SELECT PARAM_VL FROM TP_PARAM WHERE PARAM_CL = 'BOMBA_ACTIVA'`
    );
    const actual = result.rows.length > 0 ? result.rows[0].param_vl === 'true' : false;
    const nuevo = !actual;
    await query(
      `INSERT INTO TP_PARAM (PARAM_CL, PARAM_VL) VALUES ('BOMBA_ACTIVA', $1)
       ON CONFLICT (PARAM_CL) DO UPDATE SET PARAM_VL = $1`,
      [String(nuevo)]
    );
    res.json({ activa: nuevo });
  } catch (error) {
    console.error('Error al togglear bomba:', error);
    res.status(500).json({ error: 'Error al cambiar estado de bomba' });
  }
});

router.post('/ejecutar', async (req, res) => {
  try {
    const { canteroId, duracion, litros } = req.body;
    if (!canteroId) return res.status(400).json({ error: 'Cantero requerido' });
    await query(
      `INSERT INTO TH_RIHRI (CANTE_ID, RIHRI_TA, RIHRI_VL, RIHRI_FF, USUAR_ID)
       VALUES ($1, 'Manual', $2, CURRENT_TIMESTAMP + ($3 || ' minutes')::INTERVAL, $4)`,
      [canteroId, litros || 0, duracion || 10, req.user?.id || null]
    );
    res.status(201).json({ success: true, message: 'Riego ejecutado manualmente' });
  } catch (error) {
    console.error('Error al ejecutar riego:', error);
    res.status(500).json({ error: 'Error al ejecutar riego' });
  }
});

export default router;

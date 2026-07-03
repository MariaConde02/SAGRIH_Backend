import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

router.get('/consumo-semanal', async (_req, res) => {
  try {
    const result = await prisma.$queryRaw<any[]>`
       SELECT DATE(RIHRI_FI) AS fecha, SUM(RIHRI_VL) AS litros
       FROM TH_RIHRI WHERE RIHRI_FI >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(RIHRI_FI)
       ORDER BY DATE(RIHRI_FI)
    `;
    const map = {};
    for (const r of result) {
      const d = new Date(r.fecha);
      map[DIAS[d.getDay()]] = r.litros;
    }
    res.json(DIAS.map(d => ({ dia: d, litros: Number(map[d]) || 0 })));
  } catch (error: any) {
    console.error('Error en consumo-semanal:', error.message);
    res.json(DIAS.map(d => ({ dia: d, litros: 0 })));
  }
});

router.get('/riegos/meses', async (_req, res) => {
  try {
    const result = await prisma.$queryRaw<any[]>`
       SELECT DISTINCT TO_CHAR(RIHRI_FI, 'YYYY-MM') AS month
       FROM TH_RIHRI
       WHERE RIHRI_FI IS NOT NULL
       ORDER BY month DESC
    `;
    res.json(result.map(r => r.month));
  } catch (error: any) {
    console.error('Error en meses:', error.message);
    res.json([]);
  }
});

router.get('/riegos', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const month = req.query.month as string;
    const tipo = req.query.tipo as string;
    const cantero = req.query.cantero as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const isExport = limit > 1000;

    const where: any = {};

    if (cantero) {
      where.cante_id = cantero;
    }

    if (tipo) {
      where.rihri_ta = { contains: tipo, mode: 'insensitive' };
    }

    if (startDate && endDate) {
      where.rihri_fi = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else if (month) { 
      // If a specific month is selected (e.g. '2026-06')
      const startOfMonth = new Date(`${month}-01T00:00:00.000Z`);
      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59, 999);
      where.rihri_fi = {
        gte: startOfMonth,
        lte: endOfMonth
      };
    } else {
      // "Mes actual" default
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      where.rihri_fi = {
        gte: startOfMonth
      };
    }

    const totalResult = await prisma.th_rihri.aggregate({
      _count: { rihri_id: true },
      _sum: { rihri_vl: true },
      where
    });
    const total = totalResult._count.rihri_id;
    const totalLitros = totalResult._sum.rihri_vl || 0;

    const riegos = await prisma.th_rihri.findMany({
      where,
      include: {
        tm_cante: true,
        tm_usuar: true
      },
      orderBy: { rihri_fi: 'desc' },
      skip: isExport ? undefined : (page - 1) * limit,
      take: isExport ? undefined : limit
    });
    
    const data = riegos.map(r => {
      let duracionStr = "—";
      if (r.rihri_fi && r.rihri_ff) {
        const diffMs = new Date(r.rihri_ff).getTime() - new Date(r.rihri_fi).getTime();
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins > 0) duracionStr = `${diffMins}m`;
      }
      return {
        id: r.rihri_id,
        fecha: r.rihri_fi,
        cantero: r.tm_cante?.cante_nm,
        litros: r.rihri_vl,
        usuario: r.tm_usuar?.usuar_nm || r.rihri_ta,
        tipo: r.rihri_ta,
        duracion: duracionStr
      };
    });

    res.json({
       data,
       meta: {
         total,
         totalLitros,
         page: isExport ? 1 : page,
         totalPages: isExport ? 1 : Math.ceil(total / limit)
       }
    });
  } catch (error: any) {
    console.error('Error en historial riegos:', error.message);
    res.json({ data: [], meta: { total: 0, page: 1, totalPages: 1 } });
  }
});

router.get('/mantenimiento', async (_req, res) => {
  try {
    const mantenimientos = await prisma.th_mante.findMany({
      include: {
        tt_dispo: true,
        tm_usuar: true
      },
      orderBy: { mante_fe: 'desc' },
      take: 50
    });
    
    res.json(mantenimientos.map(r => ({
      id: r.mante_id,
      fecha: r.mante_fe,
      tarea: r.mante_ta,
      asignado: r.tm_usuar?.usuar_nm,
      estado: r.mante_re ? 'completada' : 'pendiente',
      prioridad: 'media',
      observaciones: r.mante_ob,
      dispositivoId: r.dispo_id,
    })));
  } catch (error: any) {
    console.error('Error en mantenimiento:', error.message);
    res.json([]);
  }
});

router.post('/mantenimiento/programar', async (req, res) => {
  try {
    const { tarea, usuarId, dispoId, observaciones, recurrencia } = req.body;
    
    // Si recurrencia es 'unica', simplemente insertamos en th_mante
    if (!recurrencia || recurrencia === 'unica') {
      const nuevo = await prisma.th_mante.create({
        data: {
          mante_ta: tarea,
          usuar_id: usuarId ? parseInt(usuarId, 10) : null,
          dispo_id: dispoId || null,
          mante_ob: observaciones,
          mante_re: false,
        }
      });
      return res.json(nuevo);
    }
    
    // Si es programado, insertamos en tt_manpr
    const prog = await prisma.tt_manpr.create({
      data: {
        manpr_ta: tarea,
        usuar_id: usuarId ? parseInt(usuarId, 10) : null,
        dispo_id: dispoId || null,
        manpr_ob: observaciones,
        manpr_rp: recurrencia,
        manpr_nx: new Date(),
        manpr_st: true
      }
    });
    
    res.json(prog);
  } catch (error: any) {
    console.error('Error al programar mantenimiento:', error.message);
    res.status(500).json({ error: 'Error al programar mantenimiento' });
  }
});

router.put('/mantenimiento/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.th_mante.findUnique({
      where: { mante_id: id },
      select: { mante_re: true }
    });
    
    if (!existing) return res.status(404).json({ error: 'No encontrada' });
    
    const updated = await prisma.th_mante.update({
      where: { mante_id: id },
      data: { mante_re: !existing.mante_re }
    });
    
    res.json({ id: updated.mante_id, realizada: updated.mante_re });
  } catch (error: any) {
    console.error('Error al toggle mantenimiento:', error.message);
    res.status(500).json({ error: 'Error al actualizar mantenimiento' });
  }
});

export default router;

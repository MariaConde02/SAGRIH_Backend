import type { Request, Response } from 'express';
import { prisma } from '../db/prismaClient.js';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export async function getConsumoSemanal(_req: Request, res: Response) {
  try {
    const result = await prisma.$queryRaw<any[]>`
       SELECT DATE(RIHRI_FI) AS fecha, SUM(RIHRI_VL) AS litros
       FROM TH_RIHRI WHERE RIHRI_FI >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(RIHRI_FI)
       ORDER BY DATE(RIHRI_FI)
    `;
    const map: Record<string, number> = {};
    for (const r of result) {
      const d = new Date(r.fecha);
      map[DIAS[d.getDay()]] = r.litros;
    }
    res.json(DIAS.map(d => ({ dia: d, litros: Number(map[d]) || 0 })));
  } catch (error: any) {
    console.error('Error en consumo-semanal:', error.message);
    res.json(DIAS.map(d => ({ dia: d, litros: 0 })));
  }
}

export async function getMesesRiegos(_req: Request, res: Response) {
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
}

export async function getHistorialRiegos(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const month = req.query.month as string;
    const tipo = req.query.tipo as string;
    const cantero = req.query.cantero as string;
    const invernadero = req.query.invernadero as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const isExport = limit > 1000;

    const where: any = {};

    if (cantero) {
      where.cante_id = cantero;
    }

    if (invernadero) {
      where.tm_cante = { inver_id: invernadero };
    }

    if (tipo) {
      where.rihri_ta = { contains: tipo, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      const rango: any = {};
      if (startDate) rango.gte = new Date(`${startDate}T00:00:00`);
      if (endDate) rango.lte = new Date(`${endDate}T23:59:59.999`);
      where.rihri_fi = rango;
    } else if (month) {
      const [y, m] = month.split('-').map(Number);
      const startOfMonth = new Date(y, (m || 1) - 1, 1);
      const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
      where.rihri_fi = { gte: startOfMonth, lte: endOfMonth };
    } else if (req.query.all !== '1') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      where.rihri_fi = { gte: startOfMonth };
    }

    const totalResult = await prisma.th_rihri.aggregate({
      _count: { rihri_id: true },
      _sum: { rihri_vl: true },
      where,
    });
    const total = totalResult._count.rihri_id;
    const totalLitros = totalResult._sum.rihri_vl || 0;

    const riegos = await prisma.th_rihri.findMany({
      where,
      include: {
        tm_cante: true,
        tm_usuar: true,
      },
      orderBy: { rihri_fi: 'desc' },
      skip: isExport ? undefined : (page - 1) * limit,
      take: isExport ? undefined : limit,
    });

    const data = riegos.map(r => {
      let duracionStr = '—';
      if (r.rihri_fi && r.rihri_ff) {
        const diffMs = new Date(r.rihri_ff).getTime() - new Date(r.rihri_fi).getTime();
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins > 0) duracionStr = `${diffMins}m`;
      }
      return {
        id: r.rihri_id,
        fecha: r.rihri_fi,
        fechaFin: r.rihri_ff,
        cantero: r.tm_cante?.cante_nm,
        litros: r.rihri_vl,
        usuario: r.tm_usuar?.usuar_nm || r.rihri_ta,
        tipo: r.rihri_ta,
        duracion: duracionStr,
      };
    });

    res.json({
      data,
      meta: {
        total,
        totalLitros,
        page: isExport ? 1 : page,
        totalPages: isExport ? 1 : Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error en historial riegos:', error.message);
    res.json({ data: [], meta: { total: 0, page: 1, totalPages: 1 } });
  }
}

/**
 * Consulta de promedios climáticos del invernadero (TH_CLIMA)
 */
export async function getHistorialClima(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const month = req.query.month as string;
    const invernadero = req.query.invernadero as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const isExport = limit > 1000;

    const where: any = {};

    if (invernadero) {
      where.inver_id = invernadero;
    }

    if (startDate || endDate) {
      const rango: any = {};
      if (startDate) rango.gte = new Date(`${startDate}T00:00:00`);
      if (endDate) rango.lte = new Date(`${endDate}T23:59:59.999`);
      where.clima_fe = rango;
    } else if (month) {
      const [y, m] = month.split('-').map(Number);
      const startOfMonth = new Date(y, (m || 1) - 1, 1);
      const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
      where.clima_fe = { gte: startOfMonth, lte: endOfMonth };
    } else if (req.query.all !== '1') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      where.clima_fe = { gte: startOfMonth };
    }

    const total = await prisma.th_clima.count({ where });

    const registros = await prisma.th_clima.findMany({
      where,
      include: { tm_inver: true },
      orderBy: { clima_fe: 'desc' },
      skip: isExport ? undefined : (page - 1) * limit,
      take: isExport ? undefined : limit,
    });

    const data = registros.map((r) => ({
      id: r.clima_id,
      fecha: r.clima_fe,
      invernadero: r.tm_inver?.inver_nm || r.inver_id,
      inver_id: r.inver_id,
      temperatura: r.clima_te !== null ? Number(r.clima_te) : null,
      humedad: r.clima_hr !== null ? Number(r.clima_hr) : null,
      luz: r.clima_lz !== null ? Number(r.clima_lz) : null,
    }));

    res.json({
      data,
      meta: {
        total,
        page: isExport ? 1 : page,
        totalPages: isExport ? 1 : Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error en historial clima:', error.message);
    res.json({ data: [], meta: { total: 0, page: 1, totalPages: 1 } });
  }
}

/**
 * Consulta de promedios de humedad del suelo por cantero (TH_SUELO)
 */
export async function getHistorialSuelo(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const month = req.query.month as string;
    const cantero = req.query.cantero as string;
    const invernadero = req.query.invernadero as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const isExport = limit > 1000;

    const where: any = {};

    if (cantero) {
      where.cante_id = cantero;
    }

    if (invernadero) {
      where.tm_cante = { inver_id: invernadero };
    }

    if (startDate || endDate) {
      const rango: any = {};
      if (startDate) rango.gte = new Date(`${startDate}T00:00:00`);
      if (endDate) rango.lte = new Date(`${endDate}T23:59:59.999`);
      where.suelo_fe = rango;
    } else if (month) {
      const [y, m] = month.split('-').map(Number);
      const startOfMonth = new Date(y, (m || 1) - 1, 1);
      const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
      where.suelo_fe = { gte: startOfMonth, lte: endOfMonth };
    } else if (req.query.all !== '1') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      where.suelo_fe = { gte: startOfMonth };
    }

    const total = await prisma.th_suelo.count({ where });

    const registros = await prisma.th_suelo.findMany({
      where,
      include: { tm_cante: { include: { tm_inver: true } } },
      orderBy: { suelo_fe: 'desc' },
      skip: isExport ? undefined : (page - 1) * limit,
      take: isExport ? undefined : limit,
    });

    const data = registros.map((r) => ({
      id: r.suelo_id,
      fecha: r.suelo_fe,
      cantero: r.tm_cante?.cante_nm || r.cante_id,
      cante_id: r.cante_id,
      invernadero: r.tm_cante?.tm_inver?.inver_nm || r.tm_cante?.inver_id || '—',
      humedadSuelo: r.suelo_hu !== null ? Number(r.suelo_hu) : null,
    }));

    res.json({
      data,
      meta: {
        total,
        page: isExport ? 1 : page,
        totalPages: isExport ? 1 : Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error en historial suelo:', error.message);
    res.json({ data: [], meta: { total: 0, page: 1, totalPages: 1 } });
  }
}

export async function getMantenimiento(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    const esAdminOIngeniero =
      currentUser?.rolNombre === 'Administrador' ||
      currentUser?.rolNombre === 'Ingeniero';

    const invernadero =
      (req.query.invernadero as string) ||
      (req.query.invernaderoId as string) ||
      (req.query.inver_id as string);

    const conditions: any[] = [];

    if (invernadero) {
      conditions.push({
        OR: [
          { tt_dispo: { inver_id: invernadero } },
          { tt_dispo: { tm_cante: { inver_id: invernadero } } },
          { mante_ob: { contains: `[Invernadero: ${invernadero}]` } },
          { mante_ob: { contains: invernadero } },
          { mante_ta: { contains: invernadero } },
        ],
      });
    }

    // Regla de Visibilidad: Si no es Admin o Ingeniero, solo ve tareas abiertas sin asignar o asignadas a él
    if (currentUser && !esAdminOIngeniero) {
      conditions.push({
        OR: [{ usuar_id: null }, { usuar_id: currentUser.id }],
      });
    }

    const where: any = {};
    if (conditions.length === 1) {
      Object.assign(where, conditions[0]);
    } else if (conditions.length > 1) {
      where.AND = conditions;
    }

    const mantenimientos = await prisma.th_mante.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        tt_dispo: {
          include: {
            tm_cante: true,
            tm_inver: true,
          },
        },
        tm_usuar: true,
      },
      orderBy: { mante_fe: 'desc' },
      take: 100,
    });

    const data = mantenimientos.map((r) => {
      let obLimpio = r.mante_ob || '';

      // Determinar alcance
      let tipoAlcance = 'invernadero';
      if (
        obLimpio.includes('[Alcance: Tanque de Agua]') ||
        r.dispo_id?.includes('TANK') ||
        r.mante_ta.toLowerCase().includes('tanque')
      ) {
        tipoAlcance = 'tanque';
      } else if (
        obLimpio.includes('[Alcance: Cantero]') ||
        r.tt_dispo?.cante_id ||
        r.mante_ta.toLowerCase().includes('cantero')
      ) {
        tipoAlcance = 'cantero';
      } else {
        tipoAlcance = 'invernadero';
      }

      // Determinar estado: resuelta (realizada), atendida, o pendiente
      let estado = 'pendiente';
      if (r.mante_re) {
        estado = 'resuelta';
      } else if (
        obLimpio.includes('[Estado: Atendida]') ||
        (r.usuar_id && obLimpio.includes('Atendido por'))
      ) {
        estado = 'atendida';
      } else {
        estado = 'pendiente';
      }

      // Recurrencia
      let recurrencia = 'Única vez';
      const matchRec = obLimpio.match(/\[Recurrencia:\s*([^\]]+)\]/);
      if (matchRec) {
        recurrencia = matchRec[1];
      }

      // Limpiar tags estructurados
      obLimpio = obLimpio
        .replace(/\[Alcance:[^\]]+\]/g, '')
        .replace(/\[Invernadero:[^\]]+\]/g, '')
        .replace(/\[Estado:[^\]]+\]/g, '')
        .replace(/\[Recurrencia:[^\]]+\]/g, '')
        .trim();

      const puedeModificarEstado =
        !r.usuar_id || (currentUser && r.usuar_id === currentUser.id);

      return {
        id: r.mante_id,
        fecha: r.mante_fe,
        tarea: r.mante_ta,
        asignado: r.tm_usuar
          ? `${r.tm_usuar.usuar_nm} ${r.tm_usuar.usuar_ap || ''}`.trim()
          : null,
        usuarId: r.usuar_id,
        estado,
        tipoAlcance, // 'invernadero' | 'cantero' | 'tanque'
        prioridad: 'media',
        observaciones: obLimpio,
        recurrencia,
        dispositivoId: r.dispo_id,
        dispositivoNombre: r.tt_dispo?.dispo_tg || null,
        canteroId: r.tt_dispo?.cante_id || null,
        canteroNombre: r.tt_dispo?.tm_cante?.cante_nm || null,
        invernaderoId:
          r.tt_dispo?.inver_id ||
          r.tt_dispo?.tm_cante?.inver_id ||
          invernadero ||
          'INV-01',
        puedeModificarEstado,
      };
    });

    res.json(data);
  } catch (error: any) {
    console.error('Error en mantenimiento:', error.message);
    res.json([]);
  }
}

export async function programarMantenimiento(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    const {
      tarea,
      usuarId,
      dispoId,
      observaciones,
      recurrencia,
      tipoAlcance = 'invernadero',
      invernaderoId = 'INV-01',
      canteId,
      yaRealizada = false,
      estado,
    } = req.body;

    const esRealizada = yaRealizada || estado === 'resuelta' || estado === 'realizada';

    // Si ya fue realizada, el responsable es el usuario que la registró (si no se especificó otro)
    let finalUsuarId: number | null = null;
    if (esRealizada) {
      finalUsuarId = usuarId ? parseInt(usuarId, 10) : (currentUser?.id || null);
    } else if (usuarId) {
      finalUsuarId = parseInt(usuarId, 10);
    } // si no, queda en null (tarea abierta sin asignar)

    let finalDispoId = dispoId || null;

    // Si es tanque y no viene dispoId, asociar al tanque del invernadero
    if (tipoAlcance === 'tanque' && !finalDispoId) {
      const tankDispo = await prisma.tt_dispo.findFirst({
        where: {
          inver_id: invernaderoId,
          OR: [
            { dispo_id: { contains: 'TANK' } },
            { dispo_tg: { contains: 'Tanque', mode: 'insensitive' } },
            { tm_tipod: { tipod_nm: 'Sensor Nivel Tanque' } },
          ],
        },
      });
      if (tankDispo) {
        finalDispoId = tankDispo.dispo_id;
      }
    }

    // Si es de cantero y viene canteId pero no dispoId, asociar a un dispositivo de ese cantero
    if (tipoAlcance === 'cantero' && canteId && !finalDispoId) {
      const canteDispo = await prisma.tt_dispo.findFirst({
        where: { cante_id: canteId },
      });
      if (canteDispo) {
        finalDispoId = canteDispo.dispo_id;
      }
    }

    // Si es de infraestructura general del invernadero y no hay dispoId
    if (tipoAlcance === 'invernadero' && !finalDispoId) {
      const generalDispo = await prisma.tt_dispo.findFirst({
        where: { inver_id: invernaderoId, cante_id: null },
      });
      if (generalDispo) {
        finalDispoId = generalDispo.dispo_id;
      }
    }

    const alcanceTag =
      tipoAlcance === 'tanque'
        ? '[Alcance: Tanque de Agua]'
        : tipoAlcance === 'cantero'
        ? '[Alcance: Cantero]'
        : '[Alcance: Invernadero]';
    const inverTag = `[Invernadero: ${invernaderoId}]`;
    const recTag = `[Recurrencia: ${recurrencia || 'Única vez'}]`;

    const obFinal = `${alcanceTag} ${inverTag} ${recTag} ${observaciones || ''}`.trim();

    const nuevo = await prisma.th_mante.create({
      data: {
        mante_ta: tarea,
        usuar_id: finalUsuarId,
        dispo_id: finalDispoId,
        mante_ob: obFinal,
        mante_re: esRealizada,
      },
      include: {
        tm_usuar: true,
        tt_dispo: {
          include: {
            tm_cante: true,
            tm_inver: true,
          },
        },
      },
    });

    if (!esRealizada && recurrencia && recurrencia !== 'unica' && recurrencia !== 'Única vez') {
      await prisma.tt_manpr.create({
        data: {
          manpr_ta: tarea,
          usuar_id: finalUsuarId,
          dispo_id: finalDispoId,
          manpr_ob: obFinal,
          manpr_rp: recurrencia,
          manpr_nx: new Date(),
          manpr_st: true,
        },
      });
    }

    return res.json(nuevo);
  } catch (error: any) {
    console.error('Error al programar mantenimiento:', error.message);
    res.status(500).json({ error: 'Error al programar mantenimiento' });
  }
}

export async function toggleMantenimiento(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    const id = parseInt(req.params.id as string, 10);
    const existing = await prisma.th_mante.findUnique({
      where: { mante_id: id },
      include: { tm_usuar: true },
    });

    if (!existing) return res.status(404).json({ error: 'No encontrada' });

    // Regla de Permisos (Caso 1):
    // Si la tarea YA TIENE un asignado, solo la persona encargada de realizar la tarea la puede cambiar de estado
    if (existing.usuar_id && currentUser) {
      if (existing.usuar_id !== currentUser.id) {
        return res.status(403).json({
          error: 'Solo la persona encargada de realizar la tarea puede cambiar su estado.',
        });
      }
    }

    const { estado, usuarId } = req.body || {};

    let nuevaRealizada = existing.mante_re;
    // Si no tenía asignado, quien la tome/atienda se convierte en el responsable (Caso 2)
    let nuevoUsuarId =
      existing.usuar_id ||
      (usuarId ? parseInt(usuarId, 10) : currentUser?.id || null);
    let obActual = existing.mante_ob || '';

    if (estado) {
      if (estado === 'atendida') {
        nuevaRealizada = false;
        if (!nuevoUsuarId && currentUser?.id) {
          nuevoUsuarId = currentUser.id;
        } else if (usuarId) {
          nuevoUsuarId = parseInt(usuarId, 10);
        }
        if (!obActual.includes('[Estado: Atendida]')) {
          obActual = `[Estado: Atendida] ${obActual}`.trim();
        }
      } else if (estado === 'resuelta' || estado === 'completada') {
        nuevaRealizada = true;
        if (!nuevoUsuarId && currentUser?.id) {
          nuevoUsuarId = currentUser.id;
        } else if (usuarId) {
          nuevoUsuarId = parseInt(usuarId, 10);
        }
        obActual = obActual.replace(/\[Estado:\s*Atendida\]/g, '').trim();
      } else if (estado === 'pendiente') {
        nuevaRealizada = false;
        obActual = obActual.replace(/\[Estado:\s*Atendida\]/g, '').trim();
      }
    } else {
      nuevaRealizada = !existing.mante_re;
      if (nuevaRealizada) {
        obActual = obActual.replace(/\[Estado:\s*Atendida\]/g, '').trim();
      }
    }

    const updated = await prisma.th_mante.update({
      where: { mante_id: id },
      data: {
        mante_re: nuevaRealizada,
        usuar_id: nuevoUsuarId,
        mante_ob: obActual,
      },
      include: {
        tm_usuar: true,
      },
    });

    res.json({
      id: updated.mante_id,
      realizada: updated.mante_re,
      usuarId: updated.usuar_id,
      asignado: updated.tm_usuar
        ? `${updated.tm_usuar.usuar_nm} ${updated.tm_usuar.usuar_ap || ''}`.trim()
        : null,
      estado: updated.mante_re
        ? 'resuelta'
        : obActual.includes('[Estado: Atendida]')
        ? 'atendida'
        : 'pendiente',
    });
  } catch (error: any) {
    console.error('Error al toggle mantenimiento:', error.message);
    res.status(500).json({ error: 'Error al actualizar mantenimiento' });
  }
}

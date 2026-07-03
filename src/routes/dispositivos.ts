import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware, checkRole } from '../middleware/auth.js';

async function verifyDeviceImpact(dispo: any, isDeleted: boolean, newState?: string) {
  const isOperative = !isDeleted && newState === 'Operativo';
  
  // Register an alert for the device failure/deletion itself
  if (!isOperative) {
    try {
      let tipalId = 1;
      const tipal = await prisma.tm_tipal.findFirst({ where: { tipal_nm: { contains: 'media', mode: 'insensitive' } } });
      if (tipal) tipalId = tipal.tipal_id;
      
      const actionStr = isDeleted ? 'eliminado' : (newState === 'En Falla' ? 'reportado con falla' : 'puesto en mantenimiento');
      
      await prisma.tt_alert.create({
        data: {
          dispo_id: dispo.dispo_id,
          tipal_id: tipalId,
          alert_ti: `Dispositivo ${dispo.dispo_id} ha sido ${actionStr}.`,
          alert_ea: 'activa'
        }
      });
    } catch (e) {
      console.error("Error creating device alert:", e);
    }
  }

  // We removed the early return if (isOperative) return null; so that we can evaluate if we need to reactivate a greenhouse.

  const tipod = await prisma.tm_tipod.findUnique({ where: { tipod_id: dispo.tipod_id } });
  if (!tipod) return null;
  const tName = tipod.tipod_nm.toLowerCase();

  let warningMsg = null;
  const reasonStr = isDeleted ? 'ha sido eliminado' : `está en ${newState ? newState.toLowerCase() : 'estado inoperativo'}`;

  if (tName.includes('controlador') || tName.includes('micro')) {
    if (dispo.inver_id) {
      const count = await prisma.tt_dispo.count({
        where: {
          inver_id: dispo.inver_id,
          dispo_id: { not: dispo.dispo_id },
          dispo_et: 'Operativo',
          deletedAt: null,
          tipod_id: dispo.tipod_id
        }
      });
      if (count === 0 && !isOperative) {
        await prisma.tm_inver.update({
          where: { inver_id: dispo.inver_id },
          data: { inver_est: 'inactivo' }
        });
        warningMsg = `Para que el invernadero opere debe tener un microcontrolador en buen estado y asignado.`;
      } else if (isOperative) {
        // If it's operative, make sure the greenhouse is active
        const prevInver = await prisma.tm_inver.findUnique({
          where: { inver_id: dispo.inver_id }
        });
        
        if (prevInver && prevInver.inver_est === 'inactivo') {
          await prisma.tm_inver.update({
            where: { inver_id: dispo.inver_id },
            data: { inver_est: 'activo' }
          });
          
          // Find the tipal_id for "info"
          const tipalInfo = await prisma.tm_tipal.findFirst({
            where: { tipal_nm: 'info' }
          });
          const tipalId = tipalInfo ? tipalInfo.tipal_id : 1;
          
          // Generate notification
          await prisma.tt_alert.create({
            data: {
              dispo_id: dispo.dispo_id,
              tipal_id: tipalId,
              alert_ti: `El invernadero ${prevInver.inver_nm || prevInver.inver_id} ha sido reactivado exitosamente tras asignar un microcontrolador operativo.`,
              alert_fd: new Date(),
              alert_ea: 'activa'
            }
          });
        }
      }
    }
  } else if (tName.includes('valvula') || tName.includes('válvula') || tName.includes('humedad')) {
    if (dispo.cante_id) {
      const count = await prisma.tt_dispo.count({
        where: {
          cante_id: dispo.cante_id,
          dispo_id: { not: dispo.dispo_id },
          dispo_et: 'Operativo',
          deletedAt: null,
          tipod_id: dispo.tipod_id
        }
      });
      if (count === 0 && !isOperative) {
        try {
          await prisma.tm_cante.update({
            where: { cante_id: dispo.cante_id },
            data: { cante_est: false } as any
          });
        } catch (e) {
          console.error("Error inactivando cantero:", e);
        }
        warningMsg = `El cantero ${dispo.cante_id} se ha desactivado porque el dispositivo ${dispo.dispo_id} ${reasonStr}. Asigne un reemplazo para que vuelva a estar operativo.`;
      } else if (isOperative) {
        try {
          await prisma.tm_cante.update({
            where: { cante_id: dispo.cante_id },
            data: { cante_est: true } as any
          });
        } catch (e) {}
      }
    }
  } else if (tName.includes('ambiente') || tName.includes('ambiental')) {
    if (dispo.inver_id) {
      const count = await prisma.tt_dispo.count({
        where: {
          inver_id: dispo.inver_id,
          dispo_id: { not: dispo.dispo_id },
          dispo_et: 'Operativo',
          deletedAt: null,
          tipod_id: dispo.tipod_id
        }
      });
      if (count === 0 && !isOperative) {
        warningMsg = `Advertencia: El sensor ambiental ${dispo.dispo_id} ${reasonStr}. El invernadero se ha quedado sin sensores ambientales operativos.`;
      }
    }
  }

  if (warningMsg) {
    try {
      let tipalIdCrit = 1;
      const tipalCrit = await prisma.tm_tipal.findFirst({ where: { tipal_nm: { contains: 'crítica', mode: 'insensitive' } } });
      if (tipalCrit) tipalIdCrit = tipalCrit.tipal_id;

      await prisma.tt_alert.create({
        data: {
          dispo_id: dispo.dispo_id,
          tipal_id: tipalIdCrit,
          alert_ti: warningMsg,
          alert_ea: 'activa'
        }
      });
    } catch (e) {
      console.error("Error creating warning alert:", e);
    }
  }

  return warningMsg;
}

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const dispositivos = await prisma.tt_dispo.findMany({
      where: { deletedAt: null },
      include: {
        tm_tipod: true,
        tm_cante: true
      },
      orderBy: { dispo_id: 'asc' }
    });
    res.json(dispositivos.map(r => ({
      id: r.dispo_id,
      tipo: r.tm_tipod?.tipod_nm,
      modelo: r.dispo_tg,
      asignacion: r.tm_cante?.cante_nm,
      canteroId: r.cante_id,
      estado: r.dispo_et,
      invernaderoId: r.inver_id,
      simulado: r.dispo_sm,
    })));
  } catch (error: any) {
    console.error('Error al listar dispositivos:', error.message);
    res.status(500).json({ error: 'Error al listar dispositivos' });
  }
});

router.get('/tipos', async (_req, res) => {
  try {
    const tipos = await prisma.tm_tipod.findMany({
      orderBy: { tipod_id: 'asc' }
    });
    res.json(tipos.map(r => ({ id: r.tipod_id, nombre: r.tipod_nm })));
  } catch (error: any) {
    console.error('Error al listar tipos:', error.message);
    res.status(500).json({ error: 'Error al listar tipos' });
  }
});

router.get('/:id/lecturas', async (req, res) => {
  try {
    const lecturas = await prisma.tt_lectu.findMany({
      where: { dispo_id: req.params.id },
      include: {
        tm_unidm: true
      },
      orderBy: { lectu_fh: 'desc' },
      take: 100
    });
    res.json(lecturas.map(r => ({
      id: r.lectu_id,
      valor: r.lectu_vl,
      unidad: r.tm_unidm?.unidm_ab,
      fecha: r.lectu_fh
    })));
  } catch (error: any) {
    console.error('Error al listar lecturas:', error.message);
    res.status(500).json({ error: 'Error al listar lecturas' });
  }
});

router.post('/', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { tipoId, modelo, canteroId, invernaderoId, estado } = req.body;
    if (!tipoId) return res.status(400).json({ error: 'Tipo requerido' });
    
    const invId = invernaderoId || 'INV-MAESTRO';

    // Determinar prefijo
    const tipod = await prisma.tm_tipod.findUnique({ where: { tipod_id: tipoId } });
    let prefix = "D";
    if (tipod) {
      const nm = tipod.tipod_nm.toLowerCase();
      if (nm.includes('valvula') || nm.includes('válvula')) prefix = "V";
      else if (nm.includes('humedad')) prefix = "H";
      else if (nm.includes('ambiente') || nm.includes('ambiental')) prefix = "AMB";
      else if (nm.includes('controlador') || nm.includes('micro')) prefix = "CTRL";
      else if (nm.includes('tanque') || nm.includes('nivel')) prefix = "TANK";
    }

    // Contar secuencial
    const count = await prisma.tt_dispo.count({
      where: {
        inver_id: invId,
        dispo_id: { startsWith: `${invId}-${prefix}` },
        deletedAt: null
      }
    });

    const newId = `${invId}-${prefix}${count + 1}`;

    const createdDispo = await prisma.tt_dispo.create({
      data: {
        dispo_id: newId,
        dispo_tg: modelo || null,
        tipod_id: tipoId,
        cante_id: canteroId || null,
        inver_id: invId,
        dispo_et: estado || 'Operativo'
      }
    });

    const warning = await verifyDeviceImpact(createdDispo, false, createdDispo.dispo_et || undefined);

    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Alta de Hardware',
        audit_ds: `Dispositivo ${newId} (Modelo: ${modelo || 'N/A'}) registrado y asignado. Cantero: ${canteroId || 'Ninguno'}`
      }
    });

    res.status(201).json({ id: newId });
  } catch (error: any) {
    console.error('Error al crear dispositivo:', error.message);
    res.status(500).json({ error: 'Error al crear dispositivo' });
  }
});

router.put('/:id', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { tipoId, modelo, canteroId, estado, invernaderoId } = req.body;
    
    const dispo = await prisma.tt_dispo.update({
      where: { dispo_id: req.params.id },
      data: {
        tipod_id: tipoId !== undefined ? tipoId : undefined,
        dispo_tg: modelo !== undefined ? modelo : undefined,
        cante_id: canteroId || null,
        dispo_et: estado !== undefined ? estado : undefined,
        inver_id: invernaderoId !== undefined ? invernaderoId : undefined
      }
    });
    
    const warning = await verifyDeviceImpact(dispo, false, dispo.dispo_et || undefined);
    
    res.json({ message: 'Dispositivo actualizado', warning });
  } catch (error: any) {
    console.error('Error al actualizar dispositivo:', error.message);
    res.status(500).json({ error: 'Error al actualizar dispositivo' });
  }
});

router.delete('/:id', checkRole(['Administrador']), async (req, res) => {
  try {
    // Verificación de dependencias de seguridad (programas activos)
    const dispo = await prisma.tt_dispo.findUnique({
      where: { dispo_id: req.params.id },
      include: { tm_cante: { include: { tt_progr: { where: { progr_at: true } } } } }
    });

    if (dispo?.cante_id && dispo.tm_cante && dispo.tm_cante.tt_progr.length > 0) {
      return res.status(403).json({ error: 'Operación denegada. Este dispositivo está asignado a un cantero con programas de riego activos. Por favor, detenga o reasigne los programas primero.' });
    }

    const dispoDeleted = await prisma.tt_dispo.update({
      where: { dispo_id: req.params.id },
      data: { deletedAt: new Date() }
    });

    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Baja de Hardware',
        audit_ds: `Dispositivo ${req.params.id} dado de baja (eliminación lógica)`
      }
    });

    const warning = await verifyDeviceImpact(dispoDeleted, true);

    res.json({ success: true, warning });
  } catch (error: any) {
    if (error.code === 'P2025') {
       return res.json({ success: true }); // already deleted
    }
    console.error('Error al eliminar dispositivo:', error.message);
    res.status(500).json({ error: 'Error al eliminar dispositivo' });
  }
});

export default router;

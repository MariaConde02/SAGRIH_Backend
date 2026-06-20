import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

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

router.post('/', async (req, res) => {
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

    await prisma.tt_dispo.create({
      data: {
        dispo_id: newId,
        dispo_tg: modelo || null,
        tipod_id: tipoId,
        cante_id: canteroId || null,
        inver_id: invId,
        dispo_et: estado || 'Operativo'
      }
    });
    
    res.status(201).json({ id: newId });
  } catch (error: any) {
    console.error('Error al crear dispositivo:', error.message);
    res.status(500).json({ error: 'Error al crear dispositivo' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { tipoId, modelo, canteroId, estado, invernaderoId } = req.body;
    
    await prisma.tt_dispo.update({
      where: { dispo_id: req.params.id },
      data: {
        tipod_id: tipoId !== undefined ? tipoId : undefined,
        dispo_tg: modelo !== undefined ? modelo : undefined,
        cante_id: canteroId || null,
        dispo_et: estado !== undefined ? estado : undefined,
        inver_id: invernaderoId !== undefined ? invernaderoId : undefined
      }
    });
    
    res.json({ message: 'Dispositivo actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar dispositivo:', error.message);
    res.status(500).json({ error: 'Error al actualizar dispositivo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // Verificación de dependencias de seguridad (programas activos)
    const dispo = await prisma.tt_dispo.findUnique({
      where: { dispo_id: req.params.id },
      include: { tm_cante: { include: { tt_progr: { where: { progr_at: true } } } } }
    });

    if (dispo?.cante_id && dispo.tm_cante && dispo.tm_cante.tt_progr.length > 0) {
      return res.status(403).json({ error: 'Operación denegada. Este dispositivo está asignado a un cantero con programas de riego activos. Por favor, detenga o reasigne los programas primero.' });
    }

    await prisma.tt_dispo.update({
      where: { dispo_id: req.params.id },
      data: { deletedAt: new Date() }
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
       return res.json({ success: true }); // already deleted
    }
    console.error('Error al eliminar dispositivo:', error.message);
    res.status(500).json({ error: 'Error al eliminar dispositivo' });
  }
});

export default router;

import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const canteros = await prisma.tm_cante.findMany({
      where: { deletedAt: null },
      include: {
        tm_culti: {
          include: { tm_categ: true }
        },
        tt_dispo: true
      },
      orderBy: { cante_id: 'asc' }
    });
    
    res.json(canteros.map(r => ({
      id: r.cante_id,
      nombre: r.cante_nm,
      cultivo: r.tm_culti?.culti_nm,
      cultivoId: r.culti_id,
      umbralMin: r.cante_mi || r.tm_culti?.culti_mi,
      umbralMax: r.cante_ma || r.tm_culti?.culti_ma,
      overrideMin: r.cante_mi,
      overrideMax: r.cante_ma,
      invernaderoId: r.inver_id,
      estado: 'Activo',
      ancho: r.cante_an ? Number(r.cante_an) : null,
      largo: r.cante_la ? Number(r.cante_la) : null,
      posXM: r.pos_xm ? Number(r.pos_xm) : null,
      posYM: r.pos_ym ? Number(r.pos_ym) : null,
      orientacion: r.orienta || 'horizontal',
      fechaSiembra: r.cante_fs ? r.cante_fs.toISOString().split('T')[0] : null,
      categoria: r.tm_culti?.tm_categ?.categ_nm || null,
      categId: r.tm_culti?.culti_cg || null,
      tiempoCosecha: r.tm_culti?.culti_tc || 80,
      dispositivos: r.tt_dispo.map((d: any) => ({
        id: d.dispo_id,
        tag: d.dispo_tg,
        tipoId: d.tipod_id,
        estado: d.dispo_et
      })),
    })));
  } catch (error) {
    console.error('Error al obtener canteros:', error);
    res.status(500).json({ error: 'Error al obtener canteros' });
  }
});

router.get('/cultivos/lista', async (_req, res) => {
  try {
    const cultivos = await prisma.tm_culti.findMany({
      select: { culti_id: true, culti_cg: true, culti_nm: true, culti_mi: true, culti_ma: true, culti_tc: true },
      orderBy: { culti_nm: 'asc' }
    });
    res.json(cultivos.map(r => ({ 
      id: r.culti_id, 
      categId: r.culti_cg,
      nombre: r.culti_nm, 
      umbralMin: r.culti_mi, 
      umbralMax: r.culti_ma, 
      tiempoCosecha: r.culti_tc 
    })));
  } catch (error: any) {
    console.error('Error al listar cultivos:', error.message);
    res.json([]);
  }
});

router.post('/', async (req, res) => {
  try {
    const { id, nombre, cultivoId, invernaderoId, ancho, largo, posXM, posYM, orientacion } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre requeridos' });
    
    const parsedCultiId = cultivoId ? parseInt(String(cultivoId), 10) : null;

    await prisma.tm_cante.upsert({
      where: { cante_id: id },
      update: {
        cante_nm: nombre,
        inver_id: invernaderoId || 'INV-MAESTRO',
        culti_id: parsedCultiId,
        cante_an: ancho !== undefined ? ancho : null,
        cante_la: largo !== undefined ? largo : null,
        pos_xm: posXM !== undefined ? posXM : null,
        pos_ym: posYM !== undefined ? posYM : null,
        orienta: orientacion || 'horizontal'
      },
      create: {
        cante_id: id,
        cante_nm: nombre,
        inver_id: invernaderoId || 'INV-MAESTRO',
        culti_id: parsedCultiId,
        cante_an: ancho !== undefined ? ancho : null,
        cante_la: largo !== undefined ? largo : null,
        pos_xm: posXM !== undefined ? posXM : null,
        pos_ym: posYM !== undefined ? posYM : null,
        orienta: orientacion || 'horizontal'
      }
    });
    res.status(201).json({ id, nombre });
  } catch (error) {
    console.error('Error al crear cantero:', error);
    res.status(500).json({ error: 'Error al crear cantero' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { nombre, cultivoId, umbralMin, umbralMax, invernaderoId, estado, fechaSiembra } = req.body;
    
    await prisma.tm_cante.update({
      where: { cante_id: req.params.id },
      data: {
        cante_nm: nombre !== undefined ? nombre : undefined,
        culti_id: cultivoId !== undefined ? (cultivoId === null || cultivoId === "" ? null : parseInt(String(cultivoId), 10)) : undefined,
        cante_mi: umbralMin !== undefined ? umbralMin : undefined,
        cante_ma: umbralMax !== undefined ? umbralMax : undefined,
        inver_id: invernaderoId !== undefined ? invernaderoId : undefined,
        cante_fs: fechaSiembra !== undefined ? (fechaSiembra ? new Date(fechaSiembra) : null) : undefined
      }
    });

    const check: any = await prisma.tm_cante.findUnique({
      where: { cante_id: req.params.id },
      select: { culti_id: true }
    });
    
    if (check && (check.culti_id === null)) {
      await prisma.tt_progr.deleteMany({
        where: { cante_id: req.params.id }
      });
    }

    res.json({ message: 'Cantero actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar cantero:', error.message);
    res.status(500).json({ error: 'Error al actualizar cantero' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const activePrograms = await prisma.tt_progr.count({
      where: { cante_id: req.params.id, progr_at: true }
    });
    
    if (activePrograms > 0) {
      return res.status(403).json({ error: 'Operación denegada. El cantero tiene programas de riego activos. Deténgalos primero.' });
    }

    await prisma.tm_cante.update({
      where: { cante_id: req.params.id },
      data: { deletedAt: new Date() }
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
       return res.json({ success: true }); // already deleted
    }
    console.error('Error al eliminar cantero:', error.message);
    res.status(500).json({ error: 'Error al eliminar cantero' });
  }
});

export default router;

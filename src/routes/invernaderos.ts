import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware, checkRole } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const invernaderos = await prisma.tm_inver.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { tm_cante: true }
        }
      },
      orderBy: [ { inver_ma: 'desc' }, { inver_id: 'asc' } ]
    });
    
    res.json(invernaderos.map(r => ({
      id: r.inver_id,
      nombre: r.inver_nm,
      ubicacion: r.inver_ub,
      estado: r.inver_est,
      isMaestro: r.inver_ma,
      ancho: r.inver_an ? Number(r.inver_an) : null,
      largo: r.inver_la ? Number(r.inver_la) : null,
      pasillo: r.inver_pa ? Number(r.inver_pa) : null,
      canteros: r._count?.tm_cante || 0,
    })));
  } catch (error: any) {
    console.error('Error al listar invernaderos:', error.message);
    res.status(500).json({ error: 'Error al listar invernaderos' });
  }
});

router.get('/maestro', async (_req, res) => {
  try {
    const maestro = await prisma.tm_inver.findFirst({
      where: { inver_ma: true, deletedAt: null }
    });
    
    if (!maestro) return res.status(404).json({ error: 'Invernadero Maestro no encontrado' });
    
    res.json({
      id: maestro.inver_id,
      nombre: maestro.inver_nm,
      ubicacion: maestro.inver_ub,
      estado: maestro.inver_est,
      isMaestro: maestro.inver_ma
    });
  } catch (error: any) {
    console.error('Error al obtener invernadero maestro:', error.message);
    res.status(500).json({ error: 'Error al obtener invernadero maestro' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await prisma.tm_inver.findUnique({
      where: { inver_id: req.params.id }
    });
    
    if (!r) return res.status(404).json({ error: 'Invernadero no encontrado' });
    
    res.json({
      id: r.inver_id,
      nombre: r.inver_nm,
      ubicacion: r.inver_ub,
      estado: r.inver_est,
      isMaestro: r.inver_ma
    });
  } catch (error: any) {
    console.error('Error al obtener invernadero:', error.message);
    res.status(500).json({ error: 'Error al obtener invernadero' });
  }
});

router.post('/', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { id, nombre, ubicacion, ancho, largo, pasillo } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre requeridos' });
    
    await prisma.tm_inver.upsert({
      where: { inver_id: id },
      update: {
        inver_nm: nombre,
        inver_ub: ubicacion || null,
        inver_an: ancho || null,
        inver_la: largo || null,
        inver_pa: pasillo || null
      },
      create: {
        inver_id: id,
        inver_nm: nombre,
        inver_ub: ubicacion || null,
        inver_est: 'inactivo',
        inver_an: ancho || null,
        inver_la: largo || null,
        inver_pa: pasillo || null
      }
    });

    // Check if we need to generate an alert (it is technically always created or updated without devices here, but we can safely just generate the alert if we wanted to on creation. To be precise, since it's an upsert we don't know if it's new. A simple check for devices would be best.)
    const dispositivosCount = await prisma.tt_dispo.count({
      where: {
        inver_id: id,
        deletedAt: null,
        dispo_et: 'Operativo',
        tm_tipod: { tipod_nm: { in: ['Controlador', 'Microcontrolador'] } }
      }
    });

    if (dispositivosCount === 0) {
      await prisma.tm_inver.update({ where: { inver_id: id }, data: { inver_est: 'inactivo' } });
      const tipal = await prisma.tm_tipal.findFirst({ where: { tipal_nm: { contains: 'media', mode: 'insensitive' } } });
      await prisma.tt_alert.create({
        data: {
          tipal_id: tipal ? tipal.tipal_id : 1,
          alert_ti: `Para que el invernadero opere debe tener un microcontrolador en buen estado y asignado.`,
          alert_ea: 'activa'
        }
      });
    }

    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Creación/Edición de Invernadero',
        audit_ds: `Invernadero ${id} (${nombre}) registrado/actualizado`
      }
    });

    res.status(201).json({ id, nombre });
  } catch (error: any) {
    console.error('Error al crear invernadero:', error.message);
    res.status(500).json({ error: 'Error al crear invernadero' });
  }
});

router.put('/:id', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { nombre, ubicacion, estado, ancho, largo, pasillo } = req.body;
    
    if (estado === 'activo') {
      const dispositivosCount = await prisma.tt_dispo.count({
        where: {
          inver_id: req.params.id,
          deletedAt: null,
          dispo_et: 'Operativo',
          tm_tipod: { tipod_nm: { in: ['Controlador', 'Microcontrolador'] } }
        }
      });
      if (dispositivosCount === 0) {
        return res.status(400).json({ error: 'Para que el invernadero opere debe tener un microcontrolador en buen estado y asignado.' });
      }
    }

    await prisma.tm_inver.update({
      where: { inver_id: req.params.id },
      data: {
        inver_nm: nombre !== undefined ? nombre : undefined,
        inver_ub: ubicacion !== undefined ? ubicacion : undefined,
        inver_est: estado !== undefined ? estado : undefined,
        inver_an: ancho !== undefined ? ancho : undefined,
        inver_la: largo !== undefined ? largo : undefined,
        inver_pa: pasillo !== undefined ? pasillo : undefined
      }
    });
    
    res.json({ message: 'Invernadero actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar invernadero:', error.message);
    res.status(500).json({ error: 'Error al actualizar invernadero' });
  }
});

router.delete('/:id', checkRole(['Administrador']), async (req, res) => {
  try {
    const check = await prisma.tm_inver.findUnique({
      where: { inver_id: req.params.id },
      select: { inver_ma: true }
    });
    
    if (!check) return res.status(404).json({ error: 'No encontrado' });
    if (check.inver_ma) return res.status(403).json({ error: 'No se puede eliminar el Invernadero Maestro' });

    await prisma.tm_inver.update({
      where: { inver_id: req.params.id },
      data: { deletedAt: new Date() }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar invernadero:', error.message);
    res.status(500).json({ error: 'Error al eliminar invernadero' });
  }
});

export default router;

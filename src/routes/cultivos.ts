import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Middleware de autenticación global para estas rutas
router.use(authMiddleware);

// GET /api/cultivos - Listar todos los cultivos con su categoría
router.get('/', async (_req, res) => {
  try {
    const cultivos = await prisma.tm_culti.findMany({
      where: { deletedAt: null },
      include: {
        tm_categ: true
      },
      orderBy: { culti_nm: 'asc' }
    });
    
    res.json(cultivos.map(c => ({
      id: c.culti_id,
      nombre: c.culti_nm,
      minimo: c.culti_mi,
      maximo: c.culti_ma,
      tiempoCosecha: c.culti_tc,
      categoriaId: c.culti_cg,
      categoriaNombre: c.tm_categ?.categ_nm || 'Sin categoría'
    })));
  } catch (error: any) {
    console.error('Error al listar cultivos:', error.message);
    res.status(500).json({ error: 'Error al listar cultivos' });
  }
});

// POST /api/cultivos - Crear un nuevo cultivo
router.post('/', async (req, res) => {
  try {
    const { nombre, minimo, maximo, tiempoCosecha, categoriaId } = req.body;

    if (!nombre) return res.status(400).json({ error: 'El nombre del cultivo es requerido' });

    const existe = await prisma.tm_culti.findUnique({ where: { culti_nm: nombre } });
    if (existe && !existe.deletedAt) return res.status(400).json({ error: 'Ya existe un cultivo con este nombre' });

    // Si existe pero está borrado lógicamente, se podría reactivar, pero por simplicidad actualizamos:
    let nuevoCultivo;
    if (existe && existe.deletedAt) {
      nuevoCultivo = await prisma.tm_culti.update({
        where: { culti_nm: nombre },
        data: {
          deletedAt: null,
          culti_mi: minimo != null ? parseFloat(minimo) : null,
          culti_ma: maximo != null ? parseFloat(maximo) : null,
          culti_tc: tiempoCosecha != null ? parseInt(tiempoCosecha, 10) : null,
          culti_cg: categoriaId != null ? parseInt(categoriaId, 10) : null,
        },
        include: { tm_categ: true }
      });
    } else {
      nuevoCultivo = await prisma.tm_culti.create({
        data: {
          culti_nm: nombre,
          culti_mi: minimo != null ? parseFloat(minimo) : null,
          culti_ma: maximo != null ? parseFloat(maximo) : null,
          culti_tc: tiempoCosecha != null ? parseInt(tiempoCosecha, 10) : null,
          culti_cg: categoriaId != null ? parseInt(categoriaId, 10) : null,
        },
        include: { tm_categ: true }
      });
    }

    res.status(201).json({
      id: nuevoCultivo.culti_id,
      nombre: nuevoCultivo.culti_nm,
      minimo: nuevoCultivo.culti_mi,
      maximo: nuevoCultivo.culti_ma,
      tiempoCosecha: nuevoCultivo.culti_tc,
      categoriaId: nuevoCultivo.culti_cg,
      categoriaNombre: nuevoCultivo.tm_categ?.categ_nm || 'Sin categoría'
    });
  } catch (error: any) {
    console.error('Error al crear cultivo:', error.message);
    res.status(500).json({ error: 'Error al crear el cultivo' });
  }
});

// PUT /api/cultivos/:id - Actualizar un cultivo
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, minimo, maximo, tiempoCosecha, categoriaId } = req.body;

    const cultivo = await prisma.tm_culti.update({
      where: { culti_id: parseInt(id, 10) },
      data: {
        culti_nm: nombre,
        culti_mi: minimo != null ? parseFloat(minimo) : null,
        culti_ma: maximo != null ? parseFloat(maximo) : null,
        culti_tc: tiempoCosecha != null ? parseInt(tiempoCosecha, 10) : null,
        culti_cg: categoriaId != null ? parseInt(categoriaId, 10) : null,
      },
      include: { tm_categ: true }
    });

    res.json({
      id: cultivo.culti_id,
      nombre: cultivo.culti_nm,
      minimo: cultivo.culti_mi,
      maximo: cultivo.culti_ma,
      tiempoCosecha: cultivo.culti_tc,
      categoriaId: cultivo.culti_cg,
      categoriaNombre: cultivo.tm_categ?.categ_nm || 'Sin categoría'
    });
  } catch (error: any) {
    console.error('Error al actualizar cultivo:', error.message);
    res.status(500).json({ error: 'Error al actualizar el cultivo' });
  }
});

// DELETE /api/cultivos/:id - Borrado lógico
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const enUso = await prisma.tm_cante.findFirst({
      where: {
        culti_id: parseInt(id, 10),
        deletedAt: null
      }
    });

    if (enUso) {
      return res.status(400).json({ error: 'No se puede eliminar: el cultivo está asignado a uno o más canteros activos.' });
    }

    await prisma.tm_culti.update({
      where: { culti_id: parseInt(id, 10) },
      data: { deletedAt: new Date() }
    });
    res.json({ success: true, message: 'Cultivo eliminado correctamente' });
  } catch (error: any) {
    console.error('Error al eliminar cultivo:', error.message);
    res.status(500).json({ error: 'Error al eliminar el cultivo' });
  }
});

export default router;

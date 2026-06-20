import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const categorias = await prisma.tm_categ.findMany({
      orderBy: { categ_nm: 'asc' }
    });
    res.json(categorias.map(c => ({
      id: c.categ_id,
      nombre: c.categ_nm
    })));
  } catch (error: any) {
    console.error('Error al listar categorias:', error.message);
    res.status(500).json({ error: 'Error al listar categorías' });
  }
});

export default router;

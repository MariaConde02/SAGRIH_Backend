import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/status', async (_req, res) => {
  try {
    const invCount = await prisma.tm_inver.count();
    const dispoCount = await prisma.tt_dispo.count();
    const canterosCount = await prisma.tm_cante.count();

    const needsSetup = invCount === 0;

    res.json({
      needsSetup,
      paso: needsSetup ? 0 : (
        canterosCount === 0 ? 1 : (
          dispoCount === 0 ? 2 : 3
        )
      ),
      resumen: {
        invernaderos: invCount,
        canteros: canterosCount,
        dispositivos: dispoCount,
      },
      mensaje: needsSetup
        ? 'Bienvenido a SAGRIH. No hay invernaderos registrados. Comienza creando tu primer invernadero.'
        : 'Sistema configurado y operativo.',
    });
  } catch (error: any) {
    console.error('Error en setup/status:', error.message);
    res.status(500).json({ error: 'Error al verificar estado del sistema' });
  }
});

export default router;

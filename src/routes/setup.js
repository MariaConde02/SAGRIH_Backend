import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/status', async (_req, res) => {
  try {
    const invResult = await query('SELECT COUNT(*)::int as count FROM TM_INVER');
    const invCount = parseInt(invResult.rows[0].count, 10);

    const dispoResult = await query('SELECT COUNT(*)::int as count FROM TT_DISPO');
    const dispoCount = parseInt(dispoResult.rows[0].count, 10);

    const canterosResult = await query('SELECT COUNT(*)::int as count FROM TM_CANTE');
    const canterosCount = parseInt(canterosResult.rows[0].count, 10);

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
  } catch (error) {
    console.error('Error en setup/status:', error.message);
    res.status(500).json({ error: 'Error al verificar estado del sistema' });
  }
});

export default router;

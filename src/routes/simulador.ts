import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
// router.use(authMiddleware);

router.post('/tanque', async (req, res) => {
  try {
    const { accion } = req.body;
    
    if (!['llenar', 'vaciar'].includes(accion)) {
      return res.status(400).json({ error: 'Acción no válida. Use llenar o vaciar' });
    }

    const tanque = await prisma.tt_dispo.findFirst({
      where: { tm_tipod: { tipod_nm: 'Sensor Nivel Tanque' } }
    });

    if (!tanque) {
      console.error('[SIMULADOR] ERROR CRÍTICO: No se encontró dispositivo con tipod_nm "Sensor Nivel Tanque"');
      return res.status(404).json({ error: 'Sensor de tanque no encontrado' });
    }

    const idTanque = tanque.dispo_id;
    // Capacidad ficticia máxima 10000L
    const capacidadTanque = 10000;
    const nuevoNivel = accion === 'llenar' ? capacidadTanque : capacidadTanque * 0.05; // 100% o 5%

    // Asumimos UID=2 (Litros)
    const uidL = 2;

    await prisma.tt_lectu.create({
      data: {
        dispo_id: idTanque,
        lectu_fh: new Date(),
        lectu_vl: Math.round(nuevoNivel * 100) / 100,
        unidm_id: uidL
      }
    });

    res.json({ message: `Tanque ${accion} correctamente`, nivel: nuevoNivel });
  } catch (error) {
    console.error('Error forzando tanque:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/estres/:canteroId', async (req, res) => {
  try {
    const { canteroId } = req.params;
    
    const sensor = await prisma.tt_dispo.findFirst({
      where: {
        cante_id: canteroId,
        tm_tipod: { tipod_nm: 'Sensor Humedad' }
      }
    });

    if (!sensor) return res.status(404).json({ error: 'Sensor de humedad no encontrado' });

    // IPC (Inter-Process Communication) vía Base de Datos
    // El simulador leerá este parámetro de la tabla temporal y lo borrará
    await prisma.tt_simet.create({
      data: {
        cante_id: canteroId,
        simet_ev: 'ESTRES_HIDRICO',
        simet_vl: '15.0'
      }
    });

    res.json({ message: `Orden de estrés (-15%) enviada al cantero ${canteroId} vía TT_SIMET` });
  } catch (error) {
    console.error('Error forzando estrés hídrico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;

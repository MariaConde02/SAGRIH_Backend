import { Router } from 'express';
import { authMiddleware, checkRole } from '../middleware/auth.js';
import { RiegoService } from '../services/riegoService.js';
import { notificarRolesTelegram, notificarRestablecimiento } from '../services/telegramService.js';
import { prisma } from '../db/prismaClient.js';

const router = Router();
router.use(authMiddleware);

router.get('/estadisticas', async (req, res) => {
  try {
    const data = await RiegoService.getEstadisticas();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estadísticas' });
  }
});

router.post('/emergencia', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // ── Alcance sectorizado (Módulo 5): global | invernadero ─────────────────
    const { alcance, invernaderoId, nota } = req.body ?? {};
    if (alcance !== undefined && alcance !== 'global' && alcance !== 'invernadero') {
      return res.status(400).json({ error: 'Alcance inválido: use "global" o "invernadero"' });
    }
    if (alcance === 'invernadero' && !invernaderoId) {
      return res.status(400).json({ error: 'invernaderoId es requerido cuando el alcance es "invernadero"' });
    }

    const data = await RiegoService.ejecutarEmergencia(userId, {
      invernaderoId: alcance === 'invernadero' ? String(invernaderoId) : null,
      nota: nota ? String(nota) : null,
    });

    // ── Push inmediato a Administradores e Ingenieros (Gestión por Excepción) ──
    const quien = (req as any).user?.nombre ?? (req as any).user?.email ?? 'un operario';
    const sectorizado = data.alcance?.tipo === 'invernadero';
    notificarRolesTelegram(
      ['Administrador', 'Ingeniero'],
      '🛑',
      sectorizado
        ? `Parada de Emergencia — Invernadero ${data.alcance?.inverNm}`
        : 'Parada Global de Emergencia activada',
      sectorizado
        ? `Se ha activado la <b>parada de emergencia</b> del <b>invernadero ${data.alcance?.inverNm}</b> por <i>${quien}</i>.\n\n` +
          `• Solo las válvulas de ese sector han sido <b>cerradas</b>.\n` +
          `• El riego automático está <b>suspendido en el invernadero</b>.\n` +
          `• El resto del complejo continúa en <b>modo automático</b>.\n\n` +
          `Accede al panel para restablecer el sector cuando sea seguro.`
        : `Se ha activado la <b>parada de emergencia global</b> por <i>${quien}</i>.\n\n` +
          `• Todas las válvulas han sido <b>cerradas</b>.\n` +
          `• El suministro eléctrico ha sido <b>cortado</b>.\n` +
          `• El sistema de riego automático está <b>suspendido</b>.\n\n` +
          `Accede al panel para restablecer el sistema cuando sea seguro.`,
    );

    res.json(data);
  } catch (error: any) {
    const status = error.message?.includes('Invernadero no encontrado') ? 404
      : error.message?.includes('no está activo') ? 400
      : 500;
    res.status(status).json({ error: error.message || 'Error al registrar emergencia' });
  }
});

// Estado de la pausa global (TT_ESTOP) — usado por el Dashboard para reflejar la emergencia
router.get('/emergencia', async (_req, res) => {
  try {
    const data = await RiegoService.getEmergenciaActiva();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al consultar el estado de emergencia' });
  }
});

// Cerrar la pausa global (TT_ESTOP) y registrar la resolución
router.post('/emergencia/restablecer', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { motivo, notas } = req.body;
    if (!motivo || !String(notas || '').trim()) {
      return res.status(400).json({ error: 'Motivo y notas de resolución son obligatorios' });
    }

    // Capturar el registro ANTES de restablecerlo (para leer ESTOP_MO e INVER_ID)
    const estopActivo = await prisma.tt_estop.findFirst({
      where: { estop_av: true },
      orderBy: { estop_id: 'desc' },
      include: {
        tm_inver: { select: { inver_nm: true } },
      },
    });

    const data = await RiegoService.restablecerEmergencia(userId, String(motivo), String(notas).trim());

    // ── Push de restablecimiento a Administradores e Ingenieros ─────────────
    // (motivo ORIGINAL de la parada — ESTOP_MO antes de anexar la resolución)
    if (estopActivo) {
      const quien = (req as any).user?.nombre ?? (req as any).user?.email ?? 'un operario';
      const motivoOriginal = estopActivo.estop_mo?.split('|')[0]?.trim() ?? estopActivo.estop_mo;

      notificarRestablecimiento(
        estopActivo.tm_inver?.inver_nm ?? null,
        motivoOriginal,
        { quien, notas: String(notas).trim() },
      );
    }

    res.json(data);
  } catch (error: any) {
    const status = error.message?.includes('No hay una emergencia') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Error al restablecer el sistema' });
  }
});

router.get('/programas', async (req, res) => {
  try {
    const { invernaderoId } = req.query;
    const data = await RiegoService.getProgramas(invernaderoId as string);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener programas' });
  }
});

router.post('/programas', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { canteroId, dias, hora, duracion } = req.body;
    if (!canteroId || !dias || dias.length === 0 || !hora || !duracion) {
      return res.status(400).json({ error: 'Cantero, días, hora y duración requeridos' });
    }
    const data = await RiegoService.crearPrograma(canteroId, dias, hora, duracion);
    res.status(201).json(data);
  } catch (error: any) {
    const isConflict = error.message.includes('Horario no disponible') || error.message.includes('inválido') || error.message.includes('eliminado/inactivo') || error.message.includes('sin cultivo asignado');
    res.status(isConflict ? 409 : 500).json({ error: error.message || 'Error interno al crear programa de riego' });
  }
});

router.patch('/programas/:canteroId/:progId/estado', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const numericId = parseInt(req.params.progId.replace('prog-', ''), 10);
    const { activo } = req.body;
    const data = await RiegoService.cambiarEstadoPrograma(req.params.canteroId, numericId, activo);
    res.json(data);
  } catch (error: any) {
    const status = error.message.includes('no encontrado') ? 404 : error.message.includes('ejecucion') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Error al cambiar estado de programa' });
  }
});

router.delete('/programas/:canteroId/:progId', checkRole(['Administrador']), async (req, res) => {
  try {
    const numericId = parseInt(req.params.progId.replace('prog-', ''), 10);
    const data = await RiegoService.eliminarPrograma(req.params.canteroId, numericId);
    res.json(data);
  } catch (error: any) {
    const status = error.message.includes('no encontrado') ? 404 : error.message.includes('ejecución') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Error al eliminar programa' });
  }
});

router.get('/historial', async (_req, res) => {
  try {
    const data = await RiegoService.getHistorial();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener historial' });
  }
});

router.get('/bomba', async (_req, res) => {
  try {
    const data = await RiegoService.getEstadoBomba();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estado de bomba' });
  }
});

router.post('/bomba', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { activa } = req.body;
    const data = await RiegoService.toggleBomba(userId, activa);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al cambiar estado de bomba' });
  }
});

router.post('/ejecutar', checkRole(['Administrador', 'Supervisor']), async (req: any, res) => {
  try {
    const { canteroId, duracion, litros } = req.body;
    if (!canteroId) return res.status(400).json({ error: 'Cantero requerido' });
    const data = await RiegoService.ejecutarRiegoManual(req.user.id, canteroId, duracion, litros);
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al ejecutar riego' });
  }
});

router.post('/detener', checkRole(['Administrador', 'Supervisor']), async (req: any, res) => {
  try {
    const { canteroId } = req.body;
    if (!canteroId) return res.status(400).json({ error: 'Cantero requerido' });
    const data = await RiegoService.detenerRiegoManual(req.user.id, canteroId);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al detener riego' });
  }
});

router.get('/metricas', async (req, res) => {
  try {
    const data = await RiegoService.getMetricas();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener métricas' });
  }
});

export default router;

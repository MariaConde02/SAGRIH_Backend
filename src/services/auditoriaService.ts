import { prisma } from '../db/prismaClient.js';

export class AuditoriaService {
  /**
   * Registra una acción de auditoría
   */
  static async registrar(userId: number | null, accion: string, detalle: string | null) {
    if (!accion) {
      throw new Error('La acción es requerida para la auditoría.');
    }

    return await prisma.th_audit.create({
      data: {
        usuar_id: userId,
        audit_ac: accion,
        audit_ds: detalle
      }
    });
  }

  /**
   * Registra y valida el cambio a Modo Manual con motivo, descripción y alcance
   */
  static async registrarModoManual(
    userId: number | null,
    params: {
      motivo?: string;
      descripcion?: string;
      canteros?: string[];
      invernaderoId?: string;
      alcance?: string;
    }
  ) {
    const { motivo, descripcion, canteros = [], invernaderoId } = params;

    const MOTIVOS_VALIDOS = [
      'mantenimiento preventivo',
      'mantenimiento de la bomba principal',
      'mantenimiento de la bomba',
      'corrección de falla',
      'correccion de falla',
      'prueba de válvulas',
      'prueba de valvulas',
      'estrés hídrico detectado',
      'estres hidrico detectado'
    ];

    if (!motivo || typeof motivo !== 'string' || !motivo.trim()) {
      throw new Error('El motivo es obligatorio para pasar a Modo Manual.');
    }

    const motivoNormalizado = motivo.trim().toLowerCase();
    const esMotivoValido = MOTIVOS_VALIDOS.some(m => motivoNormalizado.includes(m) || m.includes(motivoNormalizado));
    if (!esMotivoValido) {
      throw new Error('Motivo inválido. Debe seleccionar uno de los 5 motivos autorizados.');
    }

    if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
      throw new Error('La descripción u observaciones del operador son obligatorias.');
    }

    const esBomba = motivoNormalizado.includes('bomba');
    let canterosFinales: string[] = Array.isArray(canteros) ? [...canteros] : [];
    let alcanceFinal: 'TODOS' | 'ESPECIFICOS' = esBomba ? 'TODOS' : 'ESPECIFICOS';

    if (esBomba) {
      alcanceFinal = 'TODOS';
      // Si no vienen canteros en el request, resolverlos desde tm_cante para el invernadero
      if (canterosFinales.length === 0 && invernaderoId) {
        const canterosDb = await prisma.tm_cante.findMany({
          where: { inver_id: invernaderoId, deletedAt: null },
          select: { cante_id: true }
        });
        canterosFinales = canterosDb.map(c => c.cante_id);
      }
    } else {
      alcanceFinal = 'ESPECIFICOS';
      if (canterosFinales.length === 0) {
        throw new Error('Debe seleccionar al menos un cantero para este motivo de intervención manual.');
      }
    }

    const listaSectoresStr = canterosFinales.length > 0 ? canterosFinales.join(', ') : 'Todos los sectores';
    const detalleEstructurado = `[Modo Manual] Alcance: ${alcanceFinal} (${listaSectoresStr}) | Motivo: ${motivo.trim()} | Descripción: ${descripcion.trim()}`;

    // ── Actualización atómica persistida en TM_CANTE (Fuente de Verdad) ─────
    if (alcanceFinal === 'TODOS') {
      const whereCondition: any = { deletedAt: null };
      if (invernaderoId) whereCondition.inver_id = invernaderoId;

      await prisma.tm_cante.updateMany({
        where: whereCondition,
        data: { cante_modo_manual: true }
      });

      if (canterosFinales.length === 0) {
        const cantes = await prisma.tm_cante.findMany({
          where: whereCondition,
          select: { cante_id: true }
        });
        canterosFinales = cantes.map(c => c.cante_id);
      }
    } else {
      const whereOthers: any = {
        deletedAt: null,
        cante_id: { notIn: canterosFinales }
      };
      if (invernaderoId) whereOthers.inver_id = invernaderoId;

      await prisma.$transaction([
        prisma.tm_cante.updateMany({
          where: whereOthers,
          data: { cante_modo_manual: false }
        }),
        prisma.tm_cante.updateMany({
          where: { cante_id: { in: canterosFinales }, deletedAt: null },
          data: { cante_modo_manual: true }
        })
      ]);
    }

    const registro = await prisma.th_audit.create({
      data: {
        usuar_id: userId,
        audit_ac: 'Cambio a Modo Manual',
        audit_ds: detalleEstructurado
      }
    });

    return {
      registro,
      opMode: 'manual',
      alcance: alcanceFinal,
      canteros: canterosFinales,
      motivo: motivo.trim(),
      descripcion: descripcion.trim()
    };
  }

  /**
   * Registra y aplica el retorno a Modo Automático en TM_CANTE y TH_AUDIT
   */
  static async registrarModoAutomatico(
    userId: number | null,
    params?: { invernaderoId?: string; detalle?: string }
  ) {
    const { invernaderoId, detalle } = params || {};
    const whereCondition: any = { deletedAt: null };
    if (invernaderoId) whereCondition.inver_id = invernaderoId;

    // Actualiza todos los canteros a modo automático en la base de datos
    await prisma.tm_cante.updateMany({
      where: whereCondition,
      data: { cante_modo_manual: false }
    });

    const registro = await prisma.th_audit.create({
      data: {
        usuar_id: userId,
        audit_ac: 'Cambio a Modo Automático',
        audit_ds: detalle || 'Reanudación de operación automática tras mantenimiento o intervención manual'
      }
    });

    return {
      registro,
      opMode: 'auto',
      alcance: null,
      canteros: []
    };
  }

  /**
   * Obtiene el estado real y vigente del Modo de Operación consultando TM_CANTE
   */
  static async obtenerEstadoModoOperacion(invernaderoId?: string) {
    const whereCondition: any = { deletedAt: null };
    if (invernaderoId) whereCondition.inver_id = invernaderoId;

    const canteros = await prisma.tm_cante.findMany({
      where: whereCondition,
      select: {
        cante_id: true,
        cante_nm: true,
        cante_modo_manual: true,
        inver_id: true
      },
      orderBy: { cante_id: 'asc' }
    });

    const manualSectors = canteros
      .filter(c => c.cante_modo_manual === true)
      .map(c => c.cante_id);

    const hayManuales = manualSectors.length > 0;
    const todosManuales = canteros.length > 0 && manualSectors.length === canteros.length;

    const opMode: 'manual' | 'auto' = hayManuales ? 'manual' : 'auto';
    const alcance: 'TODOS' | 'ESPECIFICOS' | null = todosManuales
      ? 'TODOS'
      : (hayManuales ? 'ESPECIFICOS' : null);

    // Consulta de metadatos informativos desde la bitácora (sin usarla como fuente de verdad del estado)
    let ultimoAudit = null;
    if (hayManuales) {
      ultimoAudit = await prisma.th_audit.findFirst({
        where: { audit_ac: 'Cambio a Modo Manual' },
        orderBy: { audit_id: 'desc' },
        include: { tm_usuar: { select: { usuar_nm: true, usuar_ap: true } } }
      });
    }

    return {
      opMode,
      alcance,
      manualSectors,
      totalCanteros: canteros.length,
      motivo: ultimoAudit ? ultimoAudit.audit_ds?.match(/Motivo:\s*([^|]+)/)?.[1]?.trim() || null : null,
      descripcion: ultimoAudit ? ultimoAudit.audit_ds?.match(/Descripción:\s*(.+)$/)?.[1]?.trim() || null : null,
      desde: ultimoAudit?.audit_fe ? ultimoAudit.audit_fe.toISOString() : null,
      operador: ultimoAudit?.tm_usuar
        ? `${ultimoAudit.tm_usuar.usuar_nm} ${ultimoAudit.tm_usuar.usuar_ap || ''}`.trim()
        : null
    };
  }

  /**
   * Obtiene la actividad reciente del usuario especificado
   */
  static async obtenerActividadUsuario(userId: number, limite: number = 10) {
    const auditLogs = await prisma.th_audit.findMany({
      where: { usuar_id: userId },
      orderBy: { audit_fe: 'desc' },
      take: limite
    });

    return auditLogs.map((log: any) => ({
      id: log.audit_id,
      fecha: log.audit_fe,
      accion: log.audit_ac,
      detalle: log.audit_ds || ''
    }));
  }

  /**
   * Obtiene la bitácora global de auditoría (para Administradores/Ingenieros)
   */
  static async obtenerBitacoraGlobal(limite: number = 200) {
    const auditLogs = await prisma.th_audit.findMany({
      include: {
        tm_usuar: {
          select: { usuar_nm: true, usuar_ap: true }
        }
      },
      orderBy: { audit_fe: 'desc' },
      take: limite
    });

    return auditLogs.map((log: any) => ({
      id: log.audit_id,
      fecha: log.audit_fe,
      usuario: log.tm_usuar ? `${log.tm_usuar.usuar_nm} ${log.tm_usuar.usuar_ap || ''}`.trim() : 'Sistema',
      accion: log.audit_ac,
      detalle: log.audit_ds || ''
    }));
  }
}

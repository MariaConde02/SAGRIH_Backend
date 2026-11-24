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

    const registro = await prisma.th_audit.create({
      data: {
        usuar_id: userId,
        audit_ac: 'Cambio a Modo Manual',
        audit_ds: detalleEstructurado
      }
    });

    return {
      registro,
      alcance: alcanceFinal,
      canteros: canterosFinales,
      motivo: motivo.trim(),
      descripcion: descripcion.trim()
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

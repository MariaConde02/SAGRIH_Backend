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

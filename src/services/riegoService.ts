import { prisma } from '../db/prismaClient.js';

const DAY_MAP: any = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 7 };
const REV_DAY_MAP: any = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export class RiegoService {
  
  static async getEstadisticas() {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const riegosHoje = await prisma.th_rihri.findMany({
        where: { rihri_fi: { gte: todayStart } }
      });

      let totalLitros = 0;
      const stats = { automatico: 0, manual: 0, emergencia: 0 };

      for (const r of riegosHoje) {
        if (r.rihri_vl) totalLitros += Number(r.rihri_vl);
        if (r.rihri_ta === 'Automático') stats.automatico++;
        else if (r.rihri_ta === 'Manual') stats.manual++;
        else if (r.rihri_ta === 'Emergencia') stats.emergencia++;
      }

      const openValvesCount = await prisma.tt_dispo.count({
        where: {
          OR: [
            { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
            { tipod_id: 4 }
          ],
          dispo_et: 'Abierta'
        }
      });

      let caudalActual = 0;
      if (openValvesCount > 0) {
        const nominal = 3.33; 
        const noise = (Math.random() * 0.1) - 0.05; 
        caudalActual = Math.max(0, (openValvesCount * nominal) + noise);
      }

      return {
        aguaConsumida: Math.round(totalLitros * 100) / 100,
        distribucion: [
          { name: 'Automático', value: stats.automatico },
          { name: 'Manual', value: stats.manual },
          { name: 'Emergencia', value: stats.emergencia }
        ],
        caudal: Math.round(caudalActual * 10) / 10,
        totalRiegos: riegosHoje.length
      };
    } catch (error: any) {
      console.error('Service Error - getEstadisticas:', error);
      throw new Error('Error al obtener estadísticas de riego');
    }
  }

  static async ejecutarEmergencia(userId: number, opts?: { invernaderoId?: string | null; nota?: string | null }) {
    try {
      const inverId = opts?.invernaderoId?.trim() || null;
      const nota = opts?.nota?.trim() || null;

      // ── Alcance sectorizado: validar invernadero y recoger sus canteros ─────
      let inverNm: string | null = null;
      let canteIds: string[] = [];
      if (inverId) {
        const inver = await prisma.tm_inver.findFirst({
          where: { inver_id: inverId, deletedAt: null },
        });
        if (!inver) throw new Error('Invernadero no encontrado');
        if (inver.inver_est && inver.inver_est !== 'activo') throw new Error('El invernadero no está activo');
        inverNm = inver.inver_nm;
        const canteros = await prisma.tm_cante.findMany({
          where: { inver_id: inverId, deletedAt: null },
          select: { cante_id: true },
        });
        canteIds = canteros.map((c) => c.cante_id);
      }

      const tipoAlerta = await prisma.tm_tipal.findFirst({ where: { tipal_nm: 'crítica' } });

      // Filtros de alcance: global = todo; sectorizado = invernadero por
      // tt_dispo.inver_id o por pertenencia de su cantero al invernadero.
      const dondeValvulas = inverId
        ? { OR: [{ inver_id: inverId }, { cante_id: { in: canteIds } }] }
        : {};
      const dondeRiegos = inverId ? { cante_id: { in: canteIds } } : {};

      const operaciones: any[] = [
        prisma.th_rihri.updateMany({
          where: {
            OR: [
              { rihri_ff: null },
              { rihri_ff: { gt: new Date() } }
            ],
            ...dondeRiegos
          },
          data: { rihri_ff: new Date(), rihri_ta: 'Emergencia' }
        }),
        prisma.tt_dispo.updateMany({
          where: {
            OR: [
              { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
              { tipod_id: 4 }
            ],
            dispo_et: 'Abierta',
            ...(inverId ? { OR: [{ inver_id: inverId }, { cante_id: { in: canteIds } }] } : {}),
          },
          data: { dispo_et: 'Operativo' }
        }),
        prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Parada de Emergencia',
            audit_ds: inverId
              ? `Se ha activado la parada de emergencia sectorizada al invernadero ${inverNm}. Sus válvulas han sido cerradas y el riego automático queda suspendido en ese sector.`
              : 'Se ha activado la parada de emergencia. El suministro eléctrico ha sido cortado y todas las válvulas se encuentran cerradas por seguridad.',
          }
        })
      ];

      if (tipoAlerta) {
        operaciones.push(
          prisma.tt_alert.create({
            data: {
              tipal_id: tipoAlerta.tipal_id,
              alert_ti: inverId
                ? `Parada de Emergencia Activada — Invernadero ${inverNm}`
                : 'Parada de Emergencia Activada',
              alert_ea: 'activa',
            }
          })
        );
      }

      // TT_ESTOP: registrar la pausa para que el Simulador IoT la respete.
      // Global: cualquier pausa activa ya bloquea. Sectorizada: solo la pausa
      // global o la del MISMO invernadero (otros sectores siguen operando).
      const dondePausa = inverId
        ? { OR: [{ inver_id: null }, { inver_id: inverId }] }
        : {};
      const pausaYaActiva = await prisma.tt_estop.findFirst({
        where: { estop_av: true, estop_fn: { gt: new Date() }, ...dondePausa }
      });
      if (!pausaYaActiva) {
        operaciones.push(
          prisma.tt_estop.create({
            data: {
              estop_tp: inverId ? 'Emergencia Invernadero' : 'Emergencia Global',
              // Ventana de seguridad: si el panel nunca restablece, el simulador reanuda solo
              estop_fn: new Date(Date.now() + 24 * 60 * 60 * 1000),
              estop_mo: nota
                ?? (inverId
                  ? `Parada de emergencia sectorizada al invernadero ${inverNm} desde el panel de control.`
                  : 'Parada de emergencia activada desde el panel de control.'),
              usuar_id: userId,
              estop_av: true,
              inver_id: inverId,
            }
          })
        );
      }

      await prisma.$transaction(operaciones);
      return {
        success: true,
        message: inverId
          ? `Parada de emergencia del invernadero ${inverNm} registrada correctamente en BBDD`
          : 'Parada de emergencia registrada correctamente en BBDD',
        alcance: { tipo: inverId ? 'invernadero' : 'global', inverId, inverNm },
      };
    } catch (error: any) {
      if (error.message?.includes('Invernadero no encontrado') || error.message?.includes('no está activo')) throw error;
      console.error('Service Error - ejecutarEmergencia:', error);
      throw new Error('Error al registrar emergencia');
    }
  }

  static async getEmergenciaActiva() {
    try {
      const activa = await prisma.tt_estop.findFirst({
        where: { estop_av: true, estop_fn: { gt: new Date() } },
        orderBy: { estop_id: 'desc' },
        include: {
          tm_usuar: { select: { usuar_nm: true, usuar_ap: true } },
          tm_inver: { select: { inver_nm: true } },
        }
      });

      if (!activa) return { activa: false };

      return {
        activa: true,
        desde: activa.estop_in,
        motivo: activa.estop_mo,
        usuario: activa.tm_usuar
          ? `${activa.tm_usuar.usuar_nm} ${activa.tm_usuar.usuar_ap || ''}`.trim()
          : null,
        // Alcance de la parada: NULL en inver_id = global (históricos)
        alcance: activa.tm_inver
          ? { tipo: 'invernadero' as const, nombre: activa.tm_inver.inver_nm }
          : { tipo: 'global' as const, nombre: null },
      };
    } catch (error: any) {
      console.error('Service Error - getEmergenciaActiva:', error);
      throw new Error('Error al consultar el estado de emergencia');
    }
  }

  static async restablecerEmergencia(userId: number, motivo: string, notas: string) {
    try {
      // Incluye también estop vencidos cuyo estop_av quedó en true (ventana expirada)
      const activa = await prisma.tt_estop.findFirst({
        where: { estop_av: true },
        orderBy: { estop_id: 'desc' }
      });

      if (!activa) throw new Error('No hay una emergencia activa para restablecer');

      const motivoResolucion = `${activa.estop_mo} | Resuelta (${motivo}): ${notas}`;

      await prisma.$transaction([
        prisma.tt_estop.update({
          where: { estop_id: activa.estop_id },
          data: { estop_av: false, estop_fn: new Date(), estop_mo: motivoResolucion }
        }),
        prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Restablecer Emergencia',
            audit_ds: `Sistema restablecido. Motivo de la emergencia: ${motivo}. Resolución: ${notas}`,
          }
        }),
      ]);

      return { success: true, message: 'Sistema restablecido correctamente' };
    } catch (error: any) {
      if (error.message?.includes('No hay una emergencia')) throw error;
      console.error('Service Error - restablecerEmergencia:', error);
      throw new Error('Error al restablecer el sistema');
    }
  }

  static async getProgramas(invernaderoId?: string) {
    try {
      const progResult = await prisma.tt_progr.findMany({
        where: {
          deletedAt: null,
          tm_cante: {
            deletedAt: null,
            ...(invernaderoId ? { inver_id: invernaderoId } : {})
          }
        },
        include: { tt_progd: { orderBy: { progd_da: 'asc' } } },
        orderBy: [{ cante_id: 'asc' }, { progr_hi: 'asc' }]
      });
      
      const programas: any = {};
      for (const prog of progResult) {
        const dias = prog.tt_progd.map(r => REV_DAY_MAP[r.progd_da]);
        if (!programas[prog.cante_id]) programas[prog.cante_id] = [];
        
        const hora = prog.progr_hi.toISOString().substring(11, 16);
        
        programas[prog.cante_id].push({
          id: `prog-${prog.progr_id}`,
          dias,
          hora,
          duracion: prog.progr_dr,
          activo: prog.progr_at,
        });
      }
      return programas;
    } catch (error: any) {
      console.error('Service Error - getProgramas:', error);
      throw new Error('Error al obtener programas de riego');
    }
  }

  static async crearPrograma(canteroId: string, dias: string[], hora: string, duracion: number) {
    try {
      const validDias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
      for (const d of dias) {
        if (!validDias.includes(d)) throw new Error(`Día inválido: ${d}`);
      }
      
      const cantero = await prisma.tm_cante.findUnique({
        where: { cante_id: String(canteroId) },
        select: { deletedAt: true, culti_id: true }
      });
      
      if (!cantero) throw new Error('Cantero no encontrado');
      if (cantero.deletedAt !== null) throw new Error('El cantero está eliminado/inactivo');
      if (!cantero.culti_id) throw new Error('No se puede regar un cantero sin cultivo asignado');

      const newStart = timeToMinutes(hora);
      const newEnd = newStart + Number(duracion);
      
      const existing = await prisma.tt_progr.findMany({
        where: { cante_id: String(canteroId), progr_at: true },
        include: { tt_progd: true }
      });
      
      for (const prog of existing) {
        const progDias = prog.tt_progd.map(r => REV_DAY_MAP[r.progd_da]);
        const sameDays = progDias.some((d: string) => dias.includes(d));
        if (sameDays) {
          const pStart = timeToMinutes(prog.progr_hi.toISOString().substring(11, 16));
          const pEnd = pStart + prog.progr_dr;
          if (newStart < pEnd && newEnd > pStart) {
            throw new Error('Horario no disponible. Choca con otro riego programado.');
          }
        }
      }

      const [hStr, mStr] = hora.split(':');
      const progHi = new Date(Date.UTC(1970, 0, 1, parseInt(hStr, 10), parseInt(mStr, 10), 0, 0));
      
      // TRANSACTION
      const newProg = await prisma.$transaction(async (tx) => {
        return await tx.tt_progr.create({
          data: {
            cante_id: String(canteroId),
            progr_hi: progHi,
            progr_dr: Number(duracion),
            progr_at: true,
            tt_progd: {
              create: dias.map((day: string) => ({ progd_da: DAY_MAP[day] }))
            }
          }
        });
      });
      
      return { id: `prog-${newProg.progr_id}`, dias, hora, duracion: Number(duracion), activo: true };
    } catch (error: any) {
      console.error('Service Error - crearPrograma:', error);
      throw error; // Let controller handle the specific message
    }
  }

  static async cambiarEstadoPrograma(canteroId: string, progId: number, activo: boolean) {
    try {
      if (activo === false) {
        const riegoActivo = await prisma.th_rihri.findFirst({
          where: { 
            cante_id: canteroId, 
            OR: [ { rihri_ff: null }, { rihri_ff: { gt: new Date() } } ]
          }
        });
        if (riegoActivo) throw new Error('No se puede desactivar el riego porque esta en ejecucion');
      }

      const result = await prisma.tt_progr.updateMany({
        where: { progr_id: progId, cante_id: canteroId },
        data: { progr_at: activo }
      });
      
      if (result.count === 0) throw new Error('Programa no encontrado');
      return { success: true, message: activo ? 'Programa activado' : 'Programa desactivado' };
    } catch (error: any) {
      console.error('Service Error - cambiarEstadoPrograma:', error);
      throw error;
    }
  }

  static async eliminarPrograma(canteroId: string, progId: number) {
    try {
      const riegoActivo = await prisma.th_rihri.findFirst({
        where: { 
          cante_id: canteroId, 
          OR: [ { rihri_ff: null }, { rihri_ff: { gt: new Date() } } ]
        }
      });
      if (riegoActivo) throw new Error('No se puede eliminar un programa en ejecución.');

      const result = await prisma.tt_progr.updateMany({
        where: { progr_id: progId, cante_id: canteroId },
        data: { deletedAt: new Date() }
      });
      
      if (result.count === 0) throw new Error('Programa no encontrado');
      return { success: true, message: 'Programa enviado a la papelera' };
    } catch (error: any) {
      console.error('Service Error - eliminarPrograma:', error);
      throw error;
    }
  }

  static async getHistorial() {
    try {
      const historial = await prisma.th_rihri.findMany({
        include: { tm_cante: true, tm_usuar: true },
        orderBy: { rihri_fi: 'desc' },
        take: 50
      });
      
      return historial.map(r => ({
        id: r.rihri_id,
        fecha: r.rihri_fi,
        cantero: r.tm_cante?.cante_nm,
        litros: r.rihri_vl,
        usuario: r.tm_usuar?.usuar_nm || r.rihri_ta,
        tipo: r.rihri_ta,
      }));
    } catch (error: any) {
      console.error('Service Error - getHistorial:', error);
      throw new Error('Error al obtener historial');
    }
  }

  static async getEstadoBomba() {
    try {
      const param = await prisma.tp_param.findUnique({
        where: { param_cl: 'BOMBA_ACTIVA' }
      });
      return { activa: param ? param.param_vl === 'true' : false };
    } catch (error: any) {
      console.error('Service Error - getEstadoBomba:', error);
      throw new Error('Error al obtener estado de bomba');
    }
  }

  static async toggleBomba(userId: number, nuevoActiva?: boolean) {
    try {
      return await prisma.$transaction(async (tx) => {
        const param = await tx.tp_param.findUnique({
          where: { param_cl: 'BOMBA_ACTIVA' }
        });
        const actual = param ? param.param_vl === 'true' : false;
        let nuevo = nuevoActiva;
        if (nuevo === undefined) nuevo = !actual;
        
        await tx.tp_param.upsert({
          where: { param_cl: 'BOMBA_ACTIVA' },
          update: { param_vl: String(nuevo) },
          create: { param_cl: 'BOMBA_ACTIVA', param_vl: String(nuevo) }
        });
        
        await tx.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: `Bomba principal ${nuevo ? 'Encendida' : 'Apagada'}`,
            audit_ds: `Cambio manual de estado de bomba`
          }
        });

        return { activa: nuevo };
      });
    } catch (error: any) {
      console.error('Service Error - toggleBomba:', error);
      throw new Error('Error al cambiar estado de bomba');
    }
  }

  static async ejecutarRiegoManual(userId: number, canteroId: string, duracion?: number, litros?: number) {
    try {
      return await prisma.$transaction(async (tx) => {
        const d = duracion ? Number(duracion) : 10;
        const ff = new Date(Date.now() + d * 60000);
        
        await tx.th_rihri.create({
          data: {
            cante_id: canteroId,
            rihri_ta: 'Manual',
            rihri_vl: litros ? Number(litros) : 0,
            rihri_ff: ff,
            usuar_id: userId
          }
        });

        // 1. Abrir la válvula asociada al cantero en TT_DISPO
        await tx.tt_dispo.updateMany({
          where: {
            cante_id: canteroId,
            OR: [
              { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
              { tipod_id: 4 }
            ]
          },
          data: { dispo_et: 'Abierta' }
        });

        const dispositivosCantero = await tx.tt_dispo.findMany({
          where: { cante_id: canteroId },
          select: { dispo_id: true }
        });
        
        if (dispositivosCantero.length > 0) {
          const ids = dispositivosCantero.map(d => d.dispo_id);
          await tx.tt_alert.updateMany({
            where: {
              dispo_id: { in: ids },
              alert_ea: 'activa',
              alert_ti: { contains: 'Humedad baja' }
            },
            data: { alert_ea: 'resuelta' }
          });
        }
        
        await tx.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Apertura de válvula manual',
            audit_ds: `Apertura remota de válvula en Cantero ${canteroId}. Duración: ${d} min`
          }
        });

        return { success: true, message: 'Riego ejecutado manualmente' };
      });
    } catch (error: any) {
      console.error('Service Error - ejecutarRiegoManual:', error);
      throw new Error('Error al ejecutar riego');
    }
  }

  static async detenerRiegoManual(userId: number, canteroId: string) {
    try {
      // Usamos Interactive Transaction para asegurarnos de que la válvula 
      // y la auditoría se creen/actualicen de forma 100% atómica.
      return await prisma.$transaction(async (tx) => {
        const riegoActivo = await tx.th_rihri.findFirst({
          where: {
            cante_id: canteroId,
            OR: [
              { rihri_ff: null },
              { rihri_ff: { gt: new Date() } }
            ]
          },
          orderBy: { rihri_fi: 'desc' }
        });

        if (riegoActivo) {
          // 1. Detener el riego en TH_RIHRI
          await tx.th_rihri.update({
            where: { rihri_id: riegoActivo.rihri_id },
            data: { rihri_ff: new Date() }
          });
        }
          
        // 2. Cerrar la válvula (retorno a estado Operativo)
        await tx.tt_dispo.updateMany({
          where: {
            cante_id: canteroId,
            OR: [
              { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
              { tipod_id: 4 }
            ]
          },
          data: { dispo_et: 'Operativo' }
        });

        // 3. Crear auditoría
        await tx.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Cierre de válvula manual',
            audit_ds: `Cierre remoto forzado de válvula en Cantero ${canteroId}`
          }
        });
        
        return { success: true, message: 'Riego detenido manualmente' };
      });
    } catch (error: any) {
      console.error('Service Error - detenerRiegoManual:', error);
      throw new Error('Error al detener riego');
    }
  }

  /**
   * Inicia un riego automático programado vinculado a TT_PROGR.
   * Abre la válvula en TT_DISPO ('Abierta') y registra la ventana activa en TH_RIHRI.
   */
  static async ejecutarRiegoProgramado(canteroId: string, progrId?: number, duracionMinutos: number = 10) {
    try {
      return await prisma.$transaction(async (tx) => {
        const ff = new Date(Date.now() + duracionMinutos * 60000);

        const nuevoRiego = await tx.th_rihri.create({
          data: {
            cante_id: canteroId,
            rihri_ta: 'Automático',
            rihri_vl: 0,
            rihri_ff: ff,
            progr_id: progrId ?? null
          }
        });

        await tx.tt_dispo.updateMany({
          where: {
            cante_id: canteroId,
            OR: [
              { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
              { tipod_id: 4 }
            ]
          },
          data: { dispo_et: 'Abierta' }
        });

        return nuevoRiego;
      });
    } catch (error: any) {
      console.error('Service Error - ejecutarRiegoProgramado:', error);
      throw error;
    }
  }

  /**
   * Inicia un riego de emergencia (activado por umbral hídrico crítico).
   * Abre la válvula en TT_DISPO ('Abierta') y registra la ventana activa en TH_RIHRI.
   */
  static async ejecutarRiegoEmergencia(canteroId: string, duracionMinutos: number = 10, litros?: number) {
    try {
      return await prisma.$transaction(async (tx) => {
        const ff = new Date(Date.now() + duracionMinutos * 60000);

        const nuevoRiego = await tx.th_rihri.create({
          data: {
            cante_id: canteroId,
            rihri_ta: 'Emergencia',
            rihri_vl: litros ? Number(litros) : 0,
            rihri_ff: ff
          }
        });

        await tx.tt_dispo.updateMany({
          where: {
            cante_id: canteroId,
            OR: [
              { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
              { tipod_id: 4 }
            ]
          },
          data: { dispo_et: 'Abierta' }
        });

        return nuevoRiego;
      });
    } catch (error: any) {
      console.error('Service Error - ejecutarRiegoEmergencia:', error);
      throw error;
    }
  }

  /**
   * Cierra automáticamente las válvulas abiertas en TT_DISPO cuyos riegos en TH_RIHRI ya hayan vencido (rihri_ff <= now).
   * Mantiene TT_DISPO.DISPO_ET coherente ante timeouts de riegos manuales, programados y de emergencia.
   */
  static async sincronizarValvulasVencidas() {
    try {
      const ahora = new Date();

      const valvulasAbiertas = await prisma.tt_dispo.findMany({
        where: {
          dispo_et: 'Abierta',
          cante_id: { not: null },
          OR: [
            { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
            { tipod_id: 4 }
          ]
        },
        select: { dispo_id: true, cante_id: true }
      });

      for (const v of valvulasAbiertas) {
        if (!v.cante_id) continue;

        const riegoActivo = await prisma.th_rihri.findFirst({
          where: {
            cante_id: v.cante_id,
            OR: [
              { rihri_ff: null },
              { rihri_ff: { gt: ahora } }
            ]
          }
        });

        if (!riegoActivo) {
          await prisma.tt_dispo.update({
            where: { dispo_id: v.dispo_id },
            data: { dispo_et: 'Operativo' }
          });
        }
      }
    } catch (error: any) {
      console.error('Error sincronizando válvulas vencidas:', error);
    }
  }

  /**
   * Evalúa TT_PROGR para iniciar riegos automáticos programados cuando coincide la hora y día.
   */
  static async verificarProgramasRiego() {
    try {
      const ahora = new Date();
      const diaNum = ahora.getDay() === 0 ? 7 : ahora.getDay();

      const estop = await prisma.tt_estop.findFirst({
        where: { estop_av: true, estop_fn: { gt: ahora } }
      });
      if (estop && !estop.inver_id) return; // Parada global activa

      const programas = await prisma.tt_progr.findMany({
        where: {
          progr_at: true,
          deletedAt: null,
          tt_progd: { some: { progd_da: diaNum } },
          tm_cante: { deletedAt: null }
        },
        include: { tm_cante: true }
      });

      const horaLocalH = ahora.getHours();
      const horaLocalM = ahora.getMinutes();
      const horaUtcH = ahora.getUTCHours();
      const horaUtcM = ahora.getUTCMinutes();

      for (const prog of programas) {
        if (!prog.progr_hi) continue;
        if (estop && estop.inver_id && prog.tm_cante?.inver_id === estop.inver_id) continue;

        const hProg = prog.progr_hi.getUTCHours();
        const mProg = prog.progr_hi.getUTCMinutes();

        const coincideUtc = (hProg === horaUtcH && mProg === horaUtcM);
        const coincideLocal = (hProg === horaLocalH && mProg === horaLocalM);
        if (!coincideUtc && !coincideLocal) continue;

        const dosMinAtras = new Date(ahora.getTime() - 2 * 60 * 1000);
        const yaEjecutado = await prisma.th_rihri.findFirst({
          where: {
            cante_id: prog.cante_id,
            progr_id: prog.progr_id,
            rihri_fi: { gte: dosMinAtras }
          }
        });

        if (yaEjecutado) continue;

        await RiegoService.ejecutarRiegoProgramado(prog.cante_id, prog.progr_id, prog.progr_dr);
        console.log(`[RIEGO-PROGRAMADO] Riego iniciado en Cantero ${prog.cante_id} (Programa ID: ${prog.progr_id})`);
      }
    } catch (error: any) {
      console.error('Service Error - verificarProgramasRiego:', error);
    }
  }

  static async getMetricas() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const riegosHoy = await prisma.th_rihri.findMany({
        where: { rihri_fi: { gte: today } }
      });

      let consumidaTotal = 0;
      let manualLiters = 0;
      let autoLiters = 0;

      for (const r of riegosHoy) {
        const litros = Number(r.rihri_vl || 0);
        consumidaTotal += litros;
        if (r.rihri_ta === 'Manual') {
          manualLiters += litros;
        } else {
          autoLiters += litros;
        }
      }

      const openValvesCount = await prisma.tt_dispo.count({
        where: {
          OR: [
            { tm_tipod: { tipod_nm: { contains: 'lvula', mode: 'insensitive' } } },
            { tipod_id: 4 }
          ],
          dispo_et: 'Abierta'
        }
      });

      let caudalActual = 0;
      if (openValvesCount > 0) {
        const nominal = 3.33; 
        const noise = (Math.random() * 0.1) - 0.05; 
        caudalActual = Math.max(0, (openValvesCount * nominal) + noise);
      }

      return {
        aguaConsumida: consumidaTotal,
        distribucion: [
          { name: 'Manual', value: manualLiters },
          { name: 'Automático', value: autoLiters }
        ],
        caudal: Math.round(caudalActual * 10) / 10
      };
    } catch (error: any) {
      console.error('Service Error - getMetricas:', error);
      throw new Error('Error al obtener métricas');
    }
  }

}

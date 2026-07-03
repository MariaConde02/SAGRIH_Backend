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
        where: { tm_tipod: { tipod_nm: 'Válvula' }, dispo_et: 'Abierta' }
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

  static async ejecutarEmergencia(userId: number) {
    try {
      const tipoAlerta = await prisma.tm_tipal.findFirst({ where: { tipal_nm: 'crítica' } });
      
      const operaciones: any[] = [
        prisma.th_rihri.updateMany({
          where: { rihri_ff: null },
          data: { rihri_ff: new Date(), rihri_ta: 'Emergencia' }
        }),
        prisma.tt_dispo.updateMany({
          where: { tm_tipod: { tipod_nm: 'Válvula' }, dispo_et: 'Abierta' },
          data: { dispo_et: 'Cerrada' }
        }),
        prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Parada de Emergencia',
            audit_ds: 'Se ha activado la parada de emergencia. El suministro eléctrico ha sido cortado y todas las válvulas se encuentran cerradas por seguridad.',
          }
        })
      ];

      if (tipoAlerta) {
        operaciones.push(
          prisma.tt_alert.create({
            data: {
              tipal_id: tipoAlerta.tipal_id,
              alert_ti: 'Parada de Emergencia Activada',
              alert_ea: 'activa',
            }
          })
        );
      }

      await prisma.$transaction(operaciones);
      return { success: true, message: 'Parada de emergencia registrada correctamente en BBDD' };
    } catch (error: any) {
      console.error('Service Error - ejecutarEmergencia:', error);
      throw new Error('Error al registrar emergencia');
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
            audit_ds: `Apertura remota de válvula en Cantero ${canteroId}. Duración: ${duracion} min`
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
            rihri_ff: { gt: new Date() }
          },
          orderBy: { rihri_fi: 'desc' }
        });

        if (riegoActivo) {
          // 1. Detener el riego
          await tx.th_rihri.update({
            where: { rihri_id: riegoActivo.rihri_id },
            data: { rihri_ff: new Date() }
          });
          
          // 2. Cerrar la válvula
          const valvula = await tx.tt_dispo.findFirst({
            where: { cante_id: canteroId, tm_tipod: { tipod_nm: 'Válvula' } }
          });
          
          if (valvula) {
            await tx.tt_dispo.update({
              where: { dispo_id: valvula.dispo_id },
              data: { dispo_et: 'Operativo' }
            });
          }

          // 3. Crear auditoría
          await tx.th_audit.create({
            data: {
              usuar_id: userId,
              audit_ac: 'Cierre de válvula manual',
              audit_ds: `Cierre remoto forzado de válvula en Cantero ${canteroId}`
            }
          });
        }
        
        return { success: true, message: 'Riego detenido manualmente' };
      });
    } catch (error: any) {
      console.error('Service Error - detenerRiegoManual:', error);
      throw new Error('Error al detener riego');
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
        where: { tm_tipod: { tipod_nm: 'Válvula' }, dispo_et: 'Abierta' }
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

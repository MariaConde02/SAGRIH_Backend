import cron from 'node-cron';
import { prisma } from '../db/prismaClient.js';
import { evaluarAlertas } from './alertService.js';
import { notificarCriticos } from './telegramService.js';
import { enviarCorreoHTML, generarPlantillaCierreDiario } from './email.service.js';
import { enviarMensajeTelegram } from './telegram.service.js';

/**
 * Rollup diario de telemetría y Purga TTL (Módulo 7: Monitoreo y Almacenamiento).
 * 1. Calcula promedios del día actual y fechas acumuladas desde TT_LECTU.
 * 2. Inserta en TH_CLIMA (por invernadero) y TH_SUELO (por cantero).
 * 3. Purga física TTL: elimina registros de TT_LECTU y TT_LOGCO con más de 7 días.
 */
export async function ejecutarRollupYPurga() {
  console.log('[CRON-TTL] Iniciando Rollup de Telemetría y Purga TTL...');
  try {
    // 1. Calcular promedios climáticos por Invernadero (TH_CLIMA)
    const climaAverages: any[] = await prisma.$queryRaw`
      SELECT 
        d.inver_id,
        DATE(l.lectu_fh) as fecha,
        AVG(CASE WHEN l.unidm_id = 2 AND (t.tipod_nm = 'Sensor Ambiente' OR d.dispo_tg ILIKE '%Ambiente%' OR d.dispo_tg ILIKE '%DHT22%') THEN l.lectu_vl ELSE NULL END)::float as temp_avg,
        AVG(CASE WHEN l.unidm_id = 1 AND (t.tipod_nm = 'Sensor Ambiente' OR d.dispo_tg ILIKE '%Ambiente%' OR d.dispo_tg ILIKE '%DHT22%') THEN l.lectu_vl ELSE NULL END)::float as hum_avg,
        AVG(CASE WHEN t.tipod_nm ILIKE '%luz%' OR t.tipod_nm ILIKE '%ldr%' OR d.dispo_tg ILIKE '%luz%' OR d.dispo_tg ILIKE '%ldr%' THEN l.lectu_vl ELSE NULL END)::float as luz_avg
      FROM tt_lectu l
      JOIN tt_dispo d ON l.dispo_id = d.dispo_id
      LEFT JOIN tm_tipod t ON d.tipod_id = t.tipod_id
      WHERE d.inver_id IS NOT NULL
      GROUP BY d.inver_id, DATE(l.lectu_fh)
      ORDER BY fecha ASC, d.inver_id ASC;
    `;

    for (const row of climaAverages) {
      const fecha = new Date(row.fecha);
      const existing = await prisma.th_clima.findFirst({
        where: {
          inver_id: row.inver_id,
          clima_fe: fecha,
        },
      });

      const data = {
        clima_te: row.temp_avg !== null ? Math.round(row.temp_avg * 100) / 100 : null,
        clima_hr: row.hum_avg !== null ? Math.round(row.hum_avg * 100) / 100 : null,
        clima_lz: row.luz_avg !== null ? Math.round(row.luz_avg * 100) / 100 : null,
      };

      if (existing) {
        await prisma.th_clima.update({
          where: { clima_id: existing.clima_id },
          data,
        });
      } else {
        await prisma.th_clima.create({
          data: {
            inver_id: row.inver_id,
            clima_fe: fecha,
            ...data,
          },
        });
      }
    }

    // 2. Calcular promedios de sustrato por Cantero (TH_SUELO)
    const sueloAverages: any[] = await prisma.$queryRaw`
      SELECT 
        d.cante_id,
        DATE(l.lectu_fh) as fecha,
        AVG(CASE WHEN l.unidm_id = 1 THEN l.lectu_vl ELSE NULL END)::float as suelo_hu_avg
      FROM tt_lectu l
      JOIN tt_dispo d ON l.dispo_id = d.dispo_id
      WHERE d.cante_id IS NOT NULL
      GROUP BY d.cante_id, DATE(l.lectu_fh)
      ORDER BY fecha ASC, d.cante_id ASC;
    `;

    for (const row of sueloAverages) {
      const fecha = new Date(row.fecha);
      const existing = await prisma.th_suelo.findFirst({
        where: {
          cante_id: row.cante_id,
          suelo_fe: fecha,
        },
      });

      const data = {
        suelo_hu: row.suelo_hu_avg !== null ? Math.round(row.suelo_hu_avg * 100) / 100 : null,
      };

      if (existing) {
        await prisma.th_suelo.update({
          where: { suelo_id: existing.suelo_id },
          data,
        });
      } else {
        await prisma.th_suelo.create({
          data: {
            cante_id: row.cante_id,
            suelo_fe: fecha,
            ...data,
          },
        });
      }
    }

    console.log(`[CRON-TTL] Rollup: ${climaAverages.length} registros TH_CLIMA y ${sueloAverages.length} registros TH_SUELO procesados.`);

    // 3. Purga TTL (Eliminar registros con más de 7 días de antigüedad)
    const haceSieteDias = new Date();
    haceSieteDias.setDate(haceSieteDias.getDate() - 7);

    const delLectu = await prisma.tt_lectu.deleteMany({
      where: { lectu_fh: { lt: haceSieteDias } },
    });
    const delLogco = await prisma.tt_logco.deleteMany({
      where: { logco_fh: { lt: haceSieteDias } },
    });

    console.log(`[CRON-TTL] Purga completada: ${delLectu.count} registros de TT_LECTU y ${delLogco.count} registros de TT_LOGCO eliminados (> 7 días).`);
    console.log('[CRON-TTL] Mantenimiento de BD completado.');
    return {
      clima: climaAverages.length,
      suelo: sueloAverages.length,
      delLectu: delLectu.count,
      delLogco: delLogco.count,
    };
  } catch (error) {
    console.error('Error en Cron Job de limpieza y rollup:', error);
    throw error;
  }
}

/**
 * ─── Automatización del Cierre Diario (Fase 2B) ──────────────────────────────
 * Recopila las métricas hídricas del día, despacha un Resumen Ejecutivo en formato
 * HTML vía Nodemailer a Ingenieros y Administradores, y envía un aviso vía Telegram.
 */
export async function ejecutarCierreDiarioAutomatico(fechaPersonalizada?: string) {
  console.log('[CRON-CIERRE] Generando reporte de cierre diario de operaciones...');
  try {
    // 1. Determinar fecha en horario de Venezuela (UTC-4)
    const hoyVzla = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const fechaStr = fechaPersonalizada || hoyVzla;
    const [year, month, day] = fechaStr.split('-').map(Number);
    const inicioDia = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
    const finDia = new Date(Date.UTC(year, month - 1, day + 1, 3, 59, 59, 999));
    const inicioDiaUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const finDiaUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    // 2. Obtener el invernadero principal
    const invernadero = await prisma.tm_inver.findFirst({
      where: { deletedAt: null },
      orderBy: { inver_id: 'asc' },
    });
    const targetInverId = invernadero?.inver_id || 'INV-01';
    const invernaderoNombre = invernadero?.inver_nm || 'Invernadero Principal';

    // 3. Riegos del día (TH_RIHRI)
    const riegos = await prisma.th_rihri.findMany({
      where: {
        rihri_fi: { gte: inicioDia, lte: finDia },
        tm_cante: { inver_id: targetInverId },
      },
      include: {
        tm_cante: {
          include: { tm_culti: true },
        },
      },
      orderBy: { rihri_fi: 'asc' },
    });

    const consumoTotalLts = riegos.reduce((acc, r) => acc + Number(r.rihri_vl || 0), 0);
    const totalRiegos = riegos.length;

    // Desglose por canteros
    const canteros = await prisma.tm_cante.findMany({
      where: { inver_id: targetInverId, deletedAt: null },
      include: { tm_culti: true },
      orderBy: { cante_id: 'asc' },
    });

    const riegosPorCantero = canteros.map((c) => {
      const litrosCantero = riegos
        .filter((r) => r.cante_id === c.cante_id)
        .reduce((acc, r) => acc + Number(r.rihri_vl || 0), 0);
      return {
        cantero: c.cante_nm,
        litros: Math.round(litrosCantero * 10) / 10,
        cultivo: c.tm_culti?.culti_nm || 'Sin cultivo',
      };
    });

    // 4. Clima promedio (TT_LECTU en tiempo real o TH_CLIMA consolidado)
    let temperaturaPromedio: number | null = null;
    let humedadPromedio: number | null = null;

    const lecturasClima = await prisma.tt_lectu.findMany({
      where: {
        lectu_fh: { gte: inicioDia, lte: finDia },
        tt_dispo: {
          OR: [{ inver_id: targetInverId }, { tm_cante: { inver_id: targetInverId } }],
          AND: [
            {
              OR: [
                { tm_tipod: { tipod_nm: { in: ['Sensor Ambiente', 'Sensor Temperatura', 'Sensor Humedad Relativa'] } } },
                { dispo_tg: { contains: 'Ambiente', mode: 'insensitive' } },
                { dispo_tg: { contains: 'DHT22', mode: 'insensitive' } },
              ],
            },
          ],
        },
      },
      include: {
        tt_dispo: { include: { tm_tipod: true } },
        tm_unidm: true,
      },
    });

    const tempLecturas = lecturasClima.filter(
      (l) =>
        l.unidm_id === 2 ||
        l.tm_unidm?.unidm_ab === '°C' ||
        l.tt_dispo?.tm_tipod?.tipod_nm?.toLowerCase().includes('temperatura')
    );
    const humLecturas = lecturasClima.filter(
      (l) =>
        (l.unidm_id === 1 ||
          l.tm_unidm?.unidm_ab === '%' ||
          l.tt_dispo?.tm_tipod?.tipod_nm?.toLowerCase().includes('humedad')) &&
        (l.tt_dispo?.tm_tipod?.tipod_nm === 'Sensor Ambiente' ||
          l.tt_dispo?.dispo_tg?.toLowerCase().includes('ambiente') ||
          l.tt_dispo?.dispo_tg?.toLowerCase().includes('dht22'))
    );

    if (tempLecturas.length > 0) {
      temperaturaPromedio =
        Math.round((tempLecturas.reduce((sum, l) => sum + Number(l.lectu_vl), 0) / tempLecturas.length) * 10) / 10;
    }
    if (humLecturas.length > 0) {
      humedadPromedio = Math.round(
        humLecturas.reduce((sum, l) => sum + Number(l.lectu_vl), 0) / humLecturas.length
      );
    }

    if (temperaturaPromedio === null || humedadPromedio === null) {
      const climas = await prisma.th_clima.findMany({
        where: {
          inver_id: targetInverId,
          OR: [
            { clima_fe: { gte: inicioDia, lte: finDia } },
            { clima_fe: { gte: inicioDiaUtc, lte: finDiaUtc } },
          ],
        },
        orderBy: { clima_fe: 'asc' },
      });
      const validTemp = climas.filter((c) => c.clima_te != null).map((c) => Number(c.clima_te));
      const validHum = climas.filter((c) => c.clima_hr != null).map((c) => Number(c.clima_hr));
      if (temperaturaPromedio === null && validTemp.length > 0) {
        temperaturaPromedio = Math.round((validTemp.reduce((a, b) => a + b, 0) / validTemp.length) * 10) / 10;
      }
      if (humedadPromedio === null && validHum.length > 0) {
        humedadPromedio = Math.round(validHum.reduce((a, b) => a + b, 0) / validHum.length);
      }
    }

    // 5. Alertas críticas del día (TT_ALERT)
    const alertas = await prisma.tt_alert.findMany({
      where: {
        alert_fd: { gte: inicioDia, lte: finDia },
        OR: [
          { tt_dispo: { tm_cante: { inver_id: targetInverId } } },
          { tt_dispo: { inver_id: targetInverId } },
        ],
      },
    });
    const totalAlertas = alertas.length;

    // 6. Buscar destinatarios (Admins e Ingenieros activos en TM_USUAR)
    const destinatarios = await prisma.tm_usuar.findMany({
      where: {
        usuar_est: 'activo',
        tm_roles: {
          roles_nm: { in: ['Administrador', 'Ingeniero'] },
        },
      },
      include: {
        tm_roles: true,
      },
    });

    const correos = destinatarios.map((u) => u.usuar_em).filter(Boolean);

    // 7. Construir plantilla HTML y enviar correo
    const htmlBody = generarPlantillaCierreDiario({
      fecha: fechaStr,
      invernaderoNombre,
      consumoTotalLts: Math.round(consumoTotalLts * 10) / 10,
      totalRiegos,
      totalAlertas,
      temperaturaPromedio,
      humedadPromedio,
      riegosPorCantero,
    });

    let emailsEnviados = false;
    if (correos.length > 0) {
      emailsEnviados = await enviarCorreoHTML(
        correos,
        `SAGRIH - Reporte Diario de Cierre (${fechaStr}) · ${invernaderoNombre}`,
        htmlBody
      );
    } else {
      console.warn('[CRON-CIERRE] No se encontraron destinatarios con rol Administrador o Ingeniero activos.');
    }

    // 8. Notificar por Telegram a los usuarios con Chat ID configurado
    let notificadosTelegram = 0;
    const mensajeTelegram =
      `📊 <b>SAGRIH - Cierre Diario de Operaciones (${fechaStr})</b>\n\n` +
      `El Resumen Ejecutivo del <b>${invernaderoNombre}</b> ha sido enviado a su correo electrónico.\n\n` +
      `💧 <b>Consumo hídrico:</b> ${Math.round(consumoTotalLts * 10) / 10} L\n` +
      `🌱 <b>Eventos de riego:</b> ${totalRiegos}\n` +
      `⚠️ <b>Alertas críticas:</b> ${totalAlertas}\n` +
      (temperaturaPromedio != null ? `🌡️ <b>Clima:</b> ${temperaturaPromedio} °C | ${humedadPromedio ?? '—'}% HR\n\n` : '\n') +
      `<i>Para visualizar las gráficas analíticas y descargar el PDF oficial, ingrese a la plataforma web.</i>`;

    for (const usuario of destinatarios) {
      if (usuario.usuar_ti) {
        const enviado = await enviarMensajeTelegram(usuario.usuar_ti, mensajeTelegram);
        if (enviado) notificadosTelegram++;
      }
    }

    console.log(
      `[CRON-CIERRE] Cierre completado: ${correos.length} correo(s) procesados (${emailsEnviados ? 'OK' : 'Simulado'}), ${notificadosTelegram} aviso(s) Telegram despachados.`
    );

    return {
      exito: true,
      fecha: fechaStr,
      invernadero: invernaderoNombre,
      consumoTotalLts,
      totalRiegos,
      totalAlertas,
      destinatariosEmail: correos.length,
      destinatariosTelegram: notificadosTelegram,
    };
  } catch (error) {
    console.error('[CRON-CIERRE] Error en Cron de Cierre Diario:', error);
    throw error;
  }
}

/**
 * Inicia el cron específico para el Cierre Diario (despacho a las 23:59 todos los días)
 */
export const iniciarCronCierreDiario = () => {
  cron.schedule('59 23 * * *', async () => {
    try {
      console.log('[CRON-CIERRE] Ejecutando despacho automático de Cierre Diario a las 23:59...');
      await ejecutarCierreDiarioAutomatico();
    } catch (error) {
      console.error('[CRON-CIERRE] Error en tarea programada de Cierre Diario:', error);
    }
  });
  console.log('[CRON] Programado Cierre Diario automático (Email + Telegram) a las 23:59.');
};

export const startCronJobs = () => {
  // ─── Tarea de Rollup de Telemetría y Purga TTL (Todos los días a las 23:59) ───
  cron.schedule('59 23 * * *', async () => {
    try {
      await ejecutarRollupYPurga();
    } catch (error) {
      console.error('Error en Cron Job de limpieza:', error);
    }
  });
  console.log('[CRON] Programado Rollup de Telemetría y Purga TTL diario a las 23:59.');

  // ─── Tarea de Cierre Diario Automático (Email + Telegram a las 23:59) ─────────
  iniciarCronCierreDiario();

  // ─── Mantenimientos programados (TT_MANPR -> TH_MANTE) ───────────────────────
  const processScheduledMaintenance = async () => {
    try {
      const now = new Date();
      const pendingSchedules = await prisma.tt_manpr.findMany({
        where: {
          manpr_st: true,
          manpr_nx: {
            lte: now
          }
        }
      });

      for (const schedule of pendingSchedules) {
        // 1. Crear el registro en el historial de mantenimiento (th_mante)
        await prisma.th_mante.create({
          data: {
            mante_ta: schedule.manpr_ta,
            usuar_id: schedule.usuar_id,
            dispo_id: schedule.dispo_id,
            mante_ob: schedule.manpr_ob,
            mante_fe: now,
            mante_re: false
          }
        });

        // 1b. Alerta de categoría Mantenimiento
        const tipalMant = await prisma.tm_tipal.findFirst({ where: { tipal_nm: 'Mantenimiento' } });
        if (tipalMant) {
          const nuevaAlerta = await prisma.tt_alert.create({
            data: {
              tipal_id: tipalMant.tipal_id,
              alert_ti: `Mantenimiento programado: ${schedule.manpr_ta}`,
              alert_ea: 'activa',
              ...(schedule.dispo_id ? { dispo_id: schedule.dispo_id } : {}),
            },
          });
          notificarCriticos(
            'Mantenimiento programado',
            `Se generó la tarea de mantenimiento <b>${schedule.manpr_ta}</b>` +
              (schedule.dispo_id ? `\nDispositivo: <code>${schedule.dispo_id}</code>` : '') +
              (schedule.manpr_ob ? `\n${schedule.manpr_ob}` : ''),
            nuevaAlerta.alert_id,
          );
        }

        // 2. Calcular la próxima fecha
        const nextDate = new Date(schedule.manpr_nx);
        if (schedule.manpr_rp === 'semanal') {
          nextDate.setDate(nextDate.getDate() + 7);
        } else if (schedule.manpr_rp === 'mensual') {
          nextDate.setMonth(nextDate.getMonth() + 1);
        } else {
          await prisma.tt_manpr.update({
            where: { manpr_id: schedule.manpr_id },
            data: { manpr_st: false }
          });
          continue;
        }

        // 3. Actualizar la fecha del próximo mantenimiento
        await prisma.tt_manpr.update({
          where: { manpr_id: schedule.manpr_id },
          data: { manpr_nx: nextDate }
        });
        
        console.log(`Mantenimiento recurrente generado: ${schedule.manpr_ta}`);
      }
    } catch (error) {
      console.error('Error procesando mantenimientos programados (Cron):', error);
    }
  };

  // ─── Motor de alertas hídricas/térmicas (cada 60 s) ─────────────────────────
  const runMotorAlertas = async () => {
    try {
      const r = await evaluarAlertas();
      if (r.creadas > 0) {
        console.log(`[ALERTAS] Ciclo: ${r.creadas} creada(s), ${r.criticas} crítica(s), ${r.resueltas} resuelta(s).`);
      }
    } catch (error) {
      console.error('Error en el motor de evaluación de alertas:', error);
    }
  };

  // Ejecutar inmediatamente al iniciar el servidor
  processScheduledMaintenance();
  runMotorAlertas();

  // Y luego periódicamente
  setInterval(processScheduledMaintenance, 3600 * 1000);
  setInterval(runMotorAlertas, 60 * 1000);
  console.log("Motor cron de mantenimientos inicializado.");
  console.log("Motor de evaluación de alertas hídricas/térmicas inicializado (cada 60s).");
};

export const iniciarCronJobs = startCronJobs;

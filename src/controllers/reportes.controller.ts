import type { Request, Response } from 'express';
import { prisma } from '../db/prismaClient.js';
import { ejecutarCierreDiarioAutomatico } from '../services/cron.js';

/**
 * Controlador de Reportes y Cierre Diario (Módulo 5: Bitácora/Reportes)
 * Endpoint: GET /api/reportes/diario?fecha=YYYY-MM-DD
 */
export const getReporteDiario = async (req: Request, res: Response) => {
  try {
    const fechaParam = (req.query.fecha as string) || '';
    const invernaderoParam =
      (req.query.invernaderoId as string) || (req.query.invernadero as string) || '';

    let inicioDia: Date;
    let finDia: Date;
    let inicioDiaUtc: Date;
    let finDiaUtc: Date;
    let fechaStr: string;

    if (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
      fechaStr = fechaParam;
      const [year, month, day] = fechaParam.split('-').map(Number);
      // Rango de 24 horas en horario de Venezuela (VET: UTC-4)
      // 00:00:00 VET = 04:00:00 UTC | 23:59:59.999 VET = 03:59:59.999 UTC del día siguiente
      inicioDia = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
      finDia = new Date(Date.UTC(year, month - 1, day + 1, 3, 59, 59, 999));
      inicioDiaUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      finDiaUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    } else {
      const hoy = new Date();
      // Calcular fecha ISO actual en zona horaria UTC-4
      const hoyVet = new Date(hoy.getTime() - 4 * 3600000);
      fechaStr = hoyVet.toISOString().split('T')[0];
      const [year, month, day] = fechaStr.split('-').map(Number);
      inicioDia = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
      finDia = new Date(Date.UTC(year, month - 1, day + 1, 3, 59, 59, 999));
      inicioDiaUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      finDiaUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    }

    const hoyVetStr = new Date(Date.now() - 4 * 3600000).toISOString().split('T')[0];
    const esHoy = fechaStr === hoyVetStr;

    // 1. Determinar el Invernadero objetivo para no mezclar canteros entre distintos invernaderos
    let targetInverId = invernaderoParam;
    if (!targetInverId) {
      const primerInver = await prisma.tm_inver.findFirst({
        where: { deletedAt: null },
        orderBy: { inver_id: 'asc' },
      });
      targetInverId = primerInver?.inver_id || 'INV-01';
    }

    const inverRecord = await prisma.tm_inver.findUnique({
      where: { inver_id: targetInverId },
    });
    const invernaderoNombre = inverRecord?.inver_nm || `Invernadero ${targetInverId}`;

    // 2. Consultar Canteros activos con su cultivo y dispositivos del invernadero seleccionado
    const canteros = await prisma.tm_cante.findMany({
      where: {
        deletedAt: null,
        inver_id: targetInverId,
      },
      include: {
        tm_culti: true,
        tt_dispo: {
          include: {
            tm_tipod: true,
          },
        },
      },
      orderBy: { cante_id: 'asc' },
    });

    // 3. Consultar Riegos (TH_RIHRI) del día seleccionado pertenecientes a este invernadero
    const riegos = await prisma.th_rihri.findMany({
      where: {
        rihri_fi: { gte: inicioDia, lte: finDia },
        tm_cante: {
          inver_id: targetInverId,
        },
      },
      include: {
        tm_cante: {
          include: {
            tm_culti: true,
            tm_inver: true,
          },
        },
        tt_progr: true,
      },
      orderBy: { rihri_fi: 'asc' },
    });

    // 4. Consultar Clima Ambiental promedio (TH_CLIMA consolidado o TT_LECTU en tiempo real) para el invernadero
    let temperaturaPromedio: number | null = null;
    let humedadPromedio: number | null = null;

    const obtenerClimaLecturas = async () => {
      const lecturasClima = await prisma.tt_lectu.findMany({
        where: {
          lectu_fh: { gte: inicioDia, lte: finDia },
          tt_dispo: {
            OR: [
              { inver_id: targetInverId },
              { tm_cante: { inver_id: targetInverId } },
            ],
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
          tt_dispo: {
            include: { tm_tipod: true },
          },
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

      return {
        temp: tempLecturas.length
          ? Math.round(
              (tempLecturas.reduce((sum, l) => sum + Number(l.lectu_vl), 0) / tempLecturas.length) * 10
            ) / 10
          : null,
        hum: humLecturas.length
          ? Math.round(
              humLecturas.reduce((sum, l) => sum + Number(l.lectu_vl), 0) / humLecturas.length
            )
          : null,
      };
    };

    const obtenerClimaHistorico = async () => {
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

      return {
        temp: validTemp.length
          ? Math.round((validTemp.reduce((a, b) => a + b, 0) / validTemp.length) * 10) / 10
          : null,
        hum: validHum.length
          ? Math.round(validHum.reduce((a, b) => a + b, 0) / validHum.length)
          : null,
      };
    };

    if (esHoy) {
      // Para el día en curso, las lecturas en tiempo real de TT_LECTU son la fuente primaria más reciente
      const lecturas = await obtenerClimaLecturas();
      temperaturaPromedio = lecturas.temp;
      humedadPromedio = lecturas.hum;

      if (temperaturaPromedio === null || humedadPromedio === null) {
        const historico = await obtenerClimaHistorico();
        if (temperaturaPromedio === null) temperaturaPromedio = historico.temp;
        if (humedadPromedio === null) humedadPromedio = historico.hum;
      }
    } else {
      // Para días anteriores, se prioriza el rollup consolidado en TH_CLIMA
      const historico = await obtenerClimaHistorico();
      temperaturaPromedio = historico.temp;
      humedadPromedio = historico.hum;

      if (temperaturaPromedio === null || humedadPromedio === null) {
        const lecturas = await obtenerClimaLecturas();
        if (temperaturaPromedio === null) temperaturaPromedio = lecturas.temp;
        if (humedadPromedio === null) humedadPromedio = lecturas.hum;
      }
    }

    // 5. Calcular Consumo Total en Litros
    const consumoTotalLts = riegos.reduce((acc, r) => acc + Number(r.rihri_vl || 0), 0);

    // 6. Análisis agronómico de telemetría por cantero
    // Si un cantero no tiene cultivo activo o no tiene sensores asignados,
    // se muestra en la distribución con su motivo técnico y sin umbrales artificiales.
    const mapaConsumo: Record<string, number> = {};
    canteros.forEach((c) => {
      mapaConsumo[c.cante_nm] = 0;
    });

    riegos.forEach((r) => {
      const nombreCantero = r.tm_cante?.cante_nm || `Cantero ${r.cante_id}`;
      mapaConsumo[nombreCantero] = (mapaConsumo[nombreCantero] || 0) + Number(r.rihri_vl || 0);
    });

    const canterosSinMetricas: { cantero: string; motivo: string }[] = [];

    const graficaConsumo = canteros.map((c) => {
      const tieneCultivo = Boolean(
        c.culti_id &&
        c.tm_culti &&
        c.tm_culti.culti_nm &&
        c.tm_culti.culti_nm.toLowerCase() !== 'sin cultivo'
      );

      const tieneSensores = Boolean(
        c.tt_dispo &&
        c.tt_dispo.some((d) => {
          const tipo = (d.tm_tipod?.tipod_nm || '').toLowerCase();
          return (tipo.includes('sensor') || tipo.includes('humedad')) && !tipo.includes('válvula');
        })
      );

      const tieneTelemetria = tieneCultivo && tieneSensores;

      let motivoSinTelemetria: string | null = null;
      if (!tieneTelemetria) {
        if (!tieneCultivo && !tieneSensores) {
          motivoSinTelemetria = 'Sin cultivo ni sensores asignados';
        } else if (!tieneCultivo) {
          motivoSinTelemetria = 'Sin cultivo activo asignado';
        } else {
          motivoSinTelemetria = 'Sin sensores asignados (solo actuadores)';
        }

        canterosSinMetricas.push({
          cantero: c.cante_nm,
          motivo: motivoSinTelemetria,
        });
      }

      // Umbrales reales de humedad (solo si el sector posee cultivo y sensores activos)
      const umbralMin =
        tieneTelemetria
          ? c.cante_mi != null
            ? Number(c.cante_mi)
            : c.tm_culti?.culti_mi != null
            ? Number(c.tm_culti.culti_mi)
            : null
          : null;

      const umbralMax =
        tieneTelemetria
          ? c.cante_ma != null
            ? Number(c.cante_ma)
            : c.tm_culti?.culti_ma != null
            ? Number(c.tm_culti.culti_ma)
            : null
          : null;

      const cultivo = c.tm_culti?.culti_nm || 'Sin cultivo asignado';
      const litros = mapaConsumo[c.cante_nm] || 0;

      return {
        cantero: c.cante_nm,
        litros: Math.round(litros * 10) / 10,
        cultivo,
        umbralMin,
        umbralMax,
        tieneTelemetria,
        motivoSinTelemetria,
      };
    });

    // 8. Consultar Alertas Críticas (TT_ALERT) y Estrés Hídrico del invernadero
    const alertasDb = await prisma.tt_alert.findMany({
      where: {
        alert_fd: { gte: inicioDia, lte: finDia },
        OR: [
          {
            tt_dispo: {
              tm_cante: {
                inver_id: targetInverId,
              },
            },
          },
          {
            tt_dispo: {
              inver_id: targetInverId,
            },
          },
        ],
      },
      include: {
        tm_tipal: true,
        tt_dispo: {
          include: {
            tm_cante: {
              include: {
                tm_inver: true,
              },
            },
            tm_inver: true,
            tm_tipod: true,
          },
        },
      },
      orderBy: { alert_fd: 'desc' },
    });

    type ItemAlerta = {
      hora: string;
      invernadero: string;
      cantero: string;
      tipo: string;
      severidad: 'Crítica' | 'Alta' | 'Advertencia';
      detalle: string;
    };

    const alertasCriticas: ItemAlerta[] = [];

    const formatearHoraVE = (fecha: Date | string | null | undefined): string => {
      if (!fecha) return '--:--';
      return new Date(fecha).toLocaleTimeString('es-VE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Caracas',
      });
    };

    // Procesar alertas de la tabla TT_ALERT
    for (const a of alertasDb) {
      const horaStr = formatearHoraVE(a.alert_fd);
      const inverNom =
        a.tt_dispo?.tm_inver?.inver_nm ||
        a.tt_dispo?.tm_cante?.tm_inver?.inver_nm ||
        invernaderoNombre;
      const canteroNom = a.tt_dispo?.tm_cante?.cante_nm || 'Estructura General';
      const tipoNom = a.tm_tipal?.tipal_nm || 'Anomalía Detectada';
      const detalle = a.alert_ti || a.tm_tipal?.tipal_ds || 'Falla en lectura o desbalance hídrico.';

      alertasCriticas.push({
        hora: horaStr,
        invernadero: inverNom,
        cantero: canteroNom,
        tipo: tipoNom,
        severidad: 'Crítica',
        detalle,
      });
    }

    // Detectar Riegos de Emergencia (activados por estrés severo)
    const riegosEmergencia = riegos.filter((r) =>
      (r.rihri_ta || '').toLowerCase().includes('emerg')
    );

    for (const r of riegosEmergencia) {
      const fechaItem = r.rihri_fi ? new Date(r.rihri_fi) : new Date();
      const horaStr = formatearHoraVE(fechaItem);
      const inverNom = r.tm_cante?.tm_inver?.inver_nm || invernaderoNombre;
      const canteroNom = r.tm_cante?.cante_nm || `Cantero ${r.cante_id}`;
      const vol = Number(r.rihri_vl || 0);

      // Si no existe ya una alerta idéntica registrada para este cantero y hora
      const yaRegistrada = alertasCriticas.some((a) => a.cantero === canteroNom && a.hora === horaStr);
      if (!yaRegistrada) {
        alertasCriticas.push({
          hora: horaStr,
          invernadero: inverNom,
          cantero: canteroNom,
          tipo: 'Estrés Hídrico Crítico',
          severidad: 'Crítica',
          detalle: `Sustrato por debajo del límite de marchitez permanente. Se activó riego de emergencia (${vol} L aplicados).`,
        });
      }
    }

    // 7. Consultar auditoría para cancelaciones / suspensiones
    const auditsCancelados = await prisma.th_audit.findMany({
      where: {
        audit_fe: { gte: inicioDia, lte: finDia },
        OR: [
          { audit_ac: { contains: 'cancel', mode: 'insensitive' } },
          { audit_ac: { contains: 'omit', mode: 'insensitive' } },
          { audit_ac: { contains: 'suspend', mode: 'insensitive' } },
        ],
      },
      orderBy: { audit_fe: 'asc' },
    });

    // 8. Estructurar la Bitácora Cronológica de Riegos y Decisiones
    type ItemBitacora = {
      hora: string;
      cantero: string;
      tipo: string;
      motivo: string;
      estado: 'Exitoso' | 'Omitido';
      timestamp: number;
    };

    const bitacoraItems: ItemBitacora[] = [];

    // Riegos ejecutados
    for (const r of riegos) {
      const fechaItem = r.rihri_fi ? new Date(r.rihri_fi) : new Date();
      const horaStr = formatearHoraVE(fechaItem);

      const canteroNom = r.tm_cante?.cante_nm || `Cantero ${r.cante_id}`;
      const ta = (r.rihri_ta || '').toLowerCase();
      const vol = Number(r.rihri_vl || 0);

      const umbralMin =
        r.tm_cante?.cante_mi != null
          ? Number(r.tm_cante.cante_mi)
          : r.tm_cante?.tm_culti?.culti_mi != null
          ? Number(r.tm_cante.tm_culti.culti_mi)
          : 45;

      let tipo = 'Programado';
      let motivo = `Humedad bajó del umbral mínimo (${umbralMin}%). Se aplicaron ${vol} L para restablecer capacidad de campo.`;

      if (ta.includes('emergencia')) {
        tipo = 'Emergencia';
        motivo = `Estrés hídrico crítico detectado en sustrato. Activación automática prioritaria (${vol} L).`;
      } else if (ta.includes('manual')) {
        tipo = 'Manual';
        motivo = `Riego manual ejecutado por técnico agronómico. Dosis administrada: ${vol} L.`;
      }

      bitacoraItems.push({
        hora: horaStr,
        cantero: canteroNom,
        tipo,
        motivo,
        estado: 'Exitoso',
        timestamp: fechaItem.getTime(),
      });
    }

    // Cancelaciones registradas en auditoría
    for (const a of auditsCancelados) {
      const fechaItem = a.audit_fe ? new Date(a.audit_fe) : new Date();
      const horaStr = formatearHoraVE(fechaItem);

      const canteroMatch = canteros.find(
        (c) =>
          a.audit_ds?.includes(c.cante_nm) ||
          a.audit_ds?.includes(c.cante_id)
      );

      bitacoraItems.push({
        hora: horaStr,
        cantero: canteroMatch ? canteroMatch.cante_nm : 'Invernadero General',
        tipo: 'Cancelado',
        motivo: a.audit_ds || 'Riego programado omitido por humedad de sustrato adecuada.',
        estado: 'Omitido',
        timestamp: fechaItem.getTime(),
      });
    }



    // Ordenar cronológicamente
    bitacoraItems.sort((a, b) => a.timestamp - b.timestamp);

    // Formato final de salida
    const respuesta = {
      fecha: fechaStr,
      invernaderoId: targetInverId,
      invernaderoNombre,
      clima: {
        temperaturaPromedio,
        humedadPromedio,
      },
      consumoTotalLts: Math.round(consumoTotalLts * 10) / 10,
      graficaConsumo,
      canterosSinMetricas,
      bitacoraRiegos: bitacoraItems.map(({ hora, cantero, tipo, motivo, estado }) => ({
        hora,
        cantero,
        tipo,
        motivo,
        estado,
      })),
      alertasCriticas,
      totalAlertasCriticas: alertasCriticas.length,
    };

    return res.json(respuesta);
  } catch (error: any) {
    console.error('Error al generar reporte de cierre diario:', error);
    return res.status(500).json({ error: 'Error interno al generar reporte de cierre diario' });
  }
};

/**
 * Despacho manual del Cierre Diario (Fase 2B)
 * Endpoint: POST /api/reportes/cierre-manual
 */
export const postCierreDiarioManual = async (req: Request, res: Response) => {
  try {
    const fecha = req.body?.fecha as string | undefined;
    const resultado = await ejecutarCierreDiarioAutomatico(fecha);
    return res.json({
      success: true,
      mensaje: 'Cierre diario procesado y despachado exitosamente.',
      data: resultado,
    });
  } catch (error: any) {
    console.error('Error al ejecutar cierre diario manual:', error);
    return res.status(500).json({ error: error?.message || 'Error al ejecutar cierre diario manual' });
  }
};

/**
 * alertService.ts — Motor de evaluación de reglas hídricas y térmicas
 * (Proceso 6.0 · Módulo 4).
 *
 * Reglas:
 *  - Hídricas: última lectura de humedad de suelo vs umbrales efectivos
 *    COALESCE(TM_CANTE.CANTE_MI/MA, TM_CULTI.CULTI_MI/MA).
 *      · valor <= umbral_min - 5  → categoría "crítica"  → Telegram
 *      · valor <  umbral_min      → categoría "alta"     (déficit)
 *      · valor >  umbral_max      → categoría "alta"     (exceso hídrico)
 *  - Térmicas: última lectura °C del Sensor Ambiente vs TP_PARAM de
 *    seguridad térmica (TEMP_MIN_CRITICA / TEMP_MAX_ALARMA / TEMP_MAX_CRITICA).
 *      · fuera de mín/máx críticos → "crítica" → Telegram
 *      · por encima de TEMP_MAX_ALARMA → "alta"
 *
 * Escrituras en TT_ALERT (ALERT_FD = ahora, ALERT_EA = activa) con dedupe por
 * prefijo de mensaje; al volver a rango se marcan "resuelta" (ALERT_EA).
 * El despacho a Telegram es fire-and-forget (no bloquea el ciclo).
 */
import { prisma } from '../db/prismaClient.js';
import { notificarCriticos } from './telegramService.js';

export interface ResumenAlertas {
  creadas: number;
  criticas: number;
  resueltas: number;
}

interface TipalMap {
  alta: number;
  critica: number;
}

const MARGEN_CRITICO_HIEDRA = 5; // 5% por debajo de CULTI_MI ya es crítico

async function cargarTipal(): Promise<TipalMap | null> {
  const filas = await prisma.tm_tipal.findMany({ where: { tipal_nm: { in: ['alta', 'crítica'] } } });
  const alta = filas.find((t) => t.tipal_nm === 'alta');
  const critica = filas.find((t) => t.tipal_nm === 'crítica');
  if (!alta || !critica) {
    console.warn('[ALERTAS] Faltan categorías "alta"/"crítica" en TM_TIPAL. Ejecuta: npx tsx prisma/seedAlertas.ts');
    return null;
  }
  return { alta: alta.tipal_id, critica: critica.tipal_id };
}

/** Existe ya una alerta ACTIVA con el mismo prefijo para este dispositivo? */
async function yaAlertada(dispoId: string, prefijo: string): Promise<boolean> {
  const existe = await prisma.tt_alert.findFirst({
    where: {
      dispo_id: dispoId,
      alert_ea: 'activa',
      alert_ti: { startsWith: prefijo },
    },
    select: { alert_id: true },
  });
  return existe !== null;
}

/** Marca como resueltas las alertas activas cuyo mensaje inicia con el prefijo. */
async function resolverAlertas(dispoId: string, prefijos: string[]): Promise<number> {
  const r = await prisma.tt_alert.updateMany({
    where: {
      dispo_id: dispoId,
      alert_ea: 'activa',
      OR: prefijos.map((p) => ({ alert_ti: { startsWith: p } })),
    },
    data: { alert_ea: 'resuelta' },
  });
  return r.count;
}

function fechaCorta(): string {
  return new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

export async function evaluarAlertas(): Promise<ResumenAlertas> {
  const resumen: ResumenAlertas = { creadas: 0, criticas: 0, resueltas: 0 };
  const tipal = await cargarTipal();
  if (!tipal) return resumen;

  // Parámetros de seguridad térmica (con valores por defecto si faltan)
  const [pMinCrit, pMaxAlarma, pMaxCrit] = await Promise.all([
    prisma.tp_param.findUnique({ where: { param_cl: 'TEMP_MIN_CRITICA' } }),
    prisma.tp_param.findUnique({ where: { param_cl: 'TEMP_MAX_ALARMA' } }),
    prisma.tp_param.findUnique({ where: { param_cl: 'TEMP_MAX_CRITICA' } }),
  ]);
  const tempMinCritica = parseFloat(pMinCrit?.param_vl || '18');
  const tempMaxAlarma  = parseFloat(pMaxAlarma?.param_vl || '30');
  const tempMaxCritica = parseFloat(pMaxCrit?.param_vl || '33');

  // ── Regla hídrica: humedad de suelo vs TM_CULTI (CULTI_MI / CULTI_MA) ──────
  const hidricas: any[] = await prisma.$queryRaw`
    SELECT d.DISPO_ID AS dispo_id,
           d.DISPO_TG  AS dispo_tg,
           d.CANTE_ID  AS cante_id,
           l.VALOR     AS valor,
           l.UMBRAL_MIN AS umbral_min,
           l.UMBRAL_MAX AS umbral_max
      FROM TT_DISPO d
      JOIN TM_TIPOD t ON t.TIPOD_ID = d.TIPOD_ID
      LEFT JOIN TM_CANTE c  ON c.CANTE_ID  = d.CANTE_ID
      LEFT JOIN TM_CULTI cu ON cu.CULTI_ID = c.CULTI_ID
      JOIN LATERAL (
        SELECT x.LECTU_VL AS VALOR,
               COALESCE(c.CANTE_MI, cu.CULTI_MI) AS UMBRAL_MIN,
               COALESCE(c.CANTE_MA, cu.CULTI_MA) AS UMBRAL_MAX
          FROM TT_LECTU x
         WHERE x.DISPO_ID = d.DISPO_ID
         ORDER BY x.LECTU_FH DESC
         LIMIT 1
      ) l ON true
     WHERE t.TIPOD_NM = 'Sensor Humedad'
       AND d.DISPO_ET IN ('Operativo', 'Abierta')
       AND l.VALOR IS NOT NULL
       AND l.UMBRAL_MIN IS NOT NULL
  `;

  for (const h of hidricas) {
    const valor = Number(h.valor);
    const min = Number(h.umbral_min);
    const max = h.umbral_max != null ? Number(h.umbral_max) : null;
    const donde = `Cantero ${h.cante_id} · ${h.dispo_tg}`;

    let categoria: 'critica' | 'alta' | null = null;
    let prefijo = '';
    let titulo = '';
    let detalle = '';

    if (valor <= min - MARGEN_CRITICO_HIEDRA) {
      categoria = 'critica';
      prefijo = 'Humedad crítica';
      titulo = `Humedad crítica en ${donde}`;
      detalle = `Humedad de suelo ${valor.toFixed(1)}% ≤ ${min - MARGEN_CRITICO_HIEDRA}% (mínimo del cultivo CULTI_MI: ${min}%).`;
    } else if (valor < min) {
      categoria = 'alta';
      prefijo = 'Humedad baja';
      titulo = `Humedad por debajo del mínimo en ${donde}`;
      detalle = `Humedad de suelo ${valor.toFixed(1)}% < mínimo del cultivo CULTI_MI: ${min}%.`;
    } else if (max != null && valor > max) {
      categoria = 'alta';
      prefijo = 'Humedad excesiva';
      titulo = `Humedad por encima del máximo en ${donde}`;
      detalle = `Humedad de suelo ${valor.toFixed(1)}% > máximo del cultivo CULTI_MA: ${max}%. Riesgo de encharcamiento.`;
    }

    if (categoria) {
      if (await yaAlertada(h.dispo_id, prefijo)) continue;

      await prisma.tt_alert.create({
        data: {
          dispo_id: h.dispo_id,
          tipal_id: categoria === 'critica' ? tipal.critica : tipal.alta,
          alert_ti: `${prefijo}: ${titulo}. ${detalle}`,
        },
      });
      resumen.creadas++;

      if (categoria === 'critica') {
        resumen.criticas++;
        // Las alertas hídricas son críticas pero NO son de Mantenimiento:
        // no se adjunta botón de resolución (solo aplica a alertas de mantenimiento).
        notificarCriticos('Alerta hídrica crítica', `<b>${titulo}</b>\n${detalle}\n${fechaCorta()}`);
      }
      console.log(`[ALERTAS] ${categoria.toUpperCase()} · ${titulo}`);
    } else {
      // Dentro de rango: resolver alertas hídricas activas de este dispositivo
      resumen.resueltas += await resolverAlertas(h.dispo_id, ['Humedad crítica', 'Humedad baja', 'Humedad excesiva']);
    }
  }

  // ── Regla térmica: Sensor Ambiente (°C) vs seguridad térmica (TP_PARAM) ────
  const termicas: any[] = await prisma.$queryRaw`
    SELECT d.DISPO_ID AS dispo_id,
           d.DISPO_TG  AS dispo_tg,
           d.CANTE_ID  AS cante_id,
           l.VALOR     AS valor
      FROM TT_DISPO d
      JOIN TM_TIPOD t ON t.TIPOD_ID = d.TIPOD_ID
      JOIN LATERAL (
        SELECT x.LECTU_VL AS VALOR
          FROM TT_LECTU x
          JOIN TM_UNIDM u ON u.UNIDM_ID = x.UNIDM_ID
         WHERE x.DISPO_ID = d.DISPO_ID
           AND u.UNIDM_AB = '°C'
         ORDER BY x.LECTU_FH DESC
         LIMIT 1
      ) l ON true
     WHERE t.TIPOD_NM = 'Sensor Ambiente'
       AND d.DISPO_ET IN ('Operativo', 'Abierta')
       AND l.VALOR IS NOT NULL
  `;

  for (const t of termicas) {
    const valor = Number(t.valor);
    const donde = `Sensor ambiente ${t.dispo_tg}${t.cante_id ? ` · Cantero ${t.cante_id}` : ''}`;

    let categoria: 'critica' | 'alta' | null = null;
    let prefijo = '';
    let titulo = '';
    let detalle = '';

    if (valor > tempMaxCritica) {
      categoria = 'critica';
      prefijo = 'Temperatura máxima crítica';
      titulo = `Temperatura crítica en ${donde}`;
      detalle = `${valor.toFixed(1)}°C supera el máximo seguro TEMP_MAX_CRITICA: ${tempMaxCritica}°C.`;
    } else if (valor < tempMinCritica) {
      categoria = 'critica';
      prefijo = 'Temperatura mínima crítica';
      titulo = `Temperatura crítica en ${donde}`;
      detalle = `${valor.toFixed(1)}°C está bajo el mínimo seguro TEMP_MIN_CRITICA: ${tempMinCritica}°C.`;
    } else if (valor > tempMaxAlarma) {
      categoria = 'alta';
      prefijo = 'Temperatura alta';
      titulo = `Temperatura alta en ${donde}`;
      detalle = `${valor.toFixed(1)}°C supera el umbral TEMP_MAX_ALARMA: ${tempMaxAlarma}°C.`;
    }

    if (categoria) {
      if (await yaAlertada(t.dispo_id, prefijo)) continue;

      const nuevaAlerta = await prisma.tt_alert.create({
        data: {
          dispo_id: t.dispo_id,
          tipal_id: categoria === 'critica' ? tipal.critica : tipal.alta,
          alert_ti: `${prefijo}: ${titulo}. ${detalle}`,
        },
        select: { alert_id: true },
      });
      resumen.creadas++;

      if (categoria === 'critica') {
        resumen.criticas++;
        // Las alertas térmicas son críticas pero NO son de Mantenimiento:
        // no se adjunta botón de resolución (solo aplica a alertas de mantenimiento).
        notificarCriticos('Alerta térmica crítica', `<b>${titulo}</b>\n${detalle}\n${fechaCorta()}`);
      }
      console.log(`[ALERTAS] ${categoria.toUpperCase()} · ${titulo}`);
    } else {
      resumen.resueltas += await resolverAlertas(t.dispo_id, [
        'Temperatura máxima crítica', 'Temperatura mínima crítica', 'Temperatura alta',
      ]);
    }
  }

  return resumen;
}

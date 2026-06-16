import { query } from '../config/database.js';

export async function obtenerNivelTanque() {
  const paramsResult = await query(
    `SELECT PARAM_CL, PARAM_VL FROM TP_PARAM WHERE PARAM_CL LIKE 'TANQUE_%'`
  );
  const flat = {};
  for (const r of paramsResult.rows) flat[r.param_cl] = parseFloat(r.param_vl);

  const capacidad = flat.TANQUE_CAPACIDAD || 10000;
  const alertaBaja = flat.TANQUE_ALERTA_BAJA || 20;
  const alertaCritica = flat.TANQUE_ALERTA_CRITICA || 10;

  const sensorResult = await query(
    `SELECT l.LECTU_VL, l.LECTU_FH
     FROM TT_LECTU l
     JOIN TT_DISPO d ON d.DISPO_ID = l.DISPO_ID
     JOIN TM_TIPOD t ON t.TIPOD_ID = d.TIPOD_ID
     WHERE t.TIPOD_NM = 'Sensor Nivel Agua'
     ORDER BY l.LECTU_FH DESC LIMIT 1`
  );

  let nivel;
  let fecha;

  if (sensorResult.rows.length > 0) {
    nivel = parseFloat(sensorResult.rows[0].lectu_vl);
    fecha = sensorResult.rows[0].lectu_fh;
  } else {
    const consumoResult = await query(
      `SELECT COALESCE(SUM(RIHRI_VL), 0) as total
       FROM TH_RIHRI WHERE RIHRI_FI >= NOW() - INTERVAL '7 days'`
    );
    nivel = Math.max(0, capacidad - parseFloat(consumoResult.rows[0].total));
    fecha = new Date().toISOString();
  }

  const porcentaje = Math.round((nivel / capacidad) * 100);

  const consumo24h = await query(
    `SELECT COALESCE(SUM(RIHRI_VL), 0) as total
     FROM TH_RIHRI WHERE RIHRI_FI >= NOW() - INTERVAL '24 hours'`
  );

  return {
    nivel: Math.round(nivel * 100) / 100,
    capacidad,
    porcentaje,
    alertaBaja,
    alertaCritica,
    consumo24h: parseFloat(consumo24h.rows[0].total),
    fecha,
  };
}

export async function obtenerAmbiente() {
  const result = await query(
    `SELECT DISTINCT ON (l.UNIDM_ID)
      l.LECTU_VL, l.LECTU_FH, u.UNIDM_AB, u.UNIDM_NM
     FROM TT_LECTU l
     JOIN TT_DISPO d ON d.DISPO_ID = l.DISPO_ID
     JOIN TM_TIPOD t ON t.TIPOD_ID = d.TIPOD_ID
     JOIN TM_UNIDM u ON u.UNIDM_ID = l.UNIDM_ID
     WHERE t.TIPOD_NM = 'Sensor Ambiente'
     ORDER BY l.UNIDM_ID, l.LECTU_FH DESC`
  );

  const temperatura = { valor: null, unidad: '°C', fecha: null };
  const humedad = { valor: null, unidad: '%', fecha: null };

  for (const r of result.rows) {
    if (r.unidm_ab === '°C') {
      temperatura.valor = parseFloat(r.lectu_vl);
      temperatura.fecha = r.lectu_fh;
    } else if (r.unidm_ab === '%') {
      humedad.valor = parseFloat(r.lectu_vl);
      humedad.fecha = r.lectu_fh;
    }
  }

  return { temperatura, humedad };
}

export async function insertarLecturas(lecturas) {
  if (!lecturas || lecturas.length === 0) return { insertadas: 0 };

  let insertadas = 0;
  for (const lectura of lecturas) {
    const { dispo_id, lectu_vl, unidm_id } = lectura;
    if (!dispo_id || lectu_vl === undefined || !unidm_id) continue;

    await query(
      `INSERT INTO TT_LECTU (DISPO_ID, LECTU_VL, UNIDM_ID) VALUES ($1, $2, $3)`,
      [dispo_id, lectu_vl, unidm_id]
    );
    insertadas++;
  }

  return { insertadas };
}

export async function obtenerRed() {
  const result = await query(
    `SELECT d.DISPO_ID, d.DISPO_TG, d.DISPO_ET,
      (SELECT LOGCO_EV FROM TT_LOGCO l
       WHERE l.DISPO_ID = d.DISPO_ID
       ORDER BY l.LOGCO_FH DESC LIMIT 1) as ultimo_evento
     FROM TT_DISPO d
     ORDER BY d.DISPO_ID`
  );

  const dispositivos = result.rows.map(r => ({
    id: r.dispo_id,
    nombre: r.dispo_tg || r.dispo_id,
    estadoAsignado: r.dispo_et,
    ultimoEvento: r.ultimo_evento || 'desconocido',
  }));

  const online = dispositivos.filter(d => d.ultimoEvento === 'online').length;
  const offline = dispositivos.filter(d => d.ultimoEvento === 'offline').length;

  return {
    total: dispositivos.length,
    online,
    offline,
    dispositivos,
  };
}

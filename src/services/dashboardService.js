import { query } from '../config/database.js';

const MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export async function obtenerTendenciaAnual() {
  const result = await query(
    `SELECT
      EXTRACT(MONTH FROM RIHRI_FI) as mes_num,
      COALESCE(SUM(RIHRI_VL), 0) as litros
     FROM TH_RIHRI
     WHERE RIHRI_FI >= NOW() - INTERVAL '12 months'
     GROUP BY EXTRACT(MONTH FROM RIHRI_FI)
     ORDER BY mes_num`
  );

  const map = {};
  for (const r of result.rows) map[parseInt(r.mes_num)] = parseFloat(r.litros);

  return MONTHS.map((mes, i) => ({
    mes,
    litros: map[i + 1] || 0,
  }));
}

export async function obtenerTendenciaMensual() {
  const result = await query(
    `SELECT
      TO_CHAR(RIHRI_FI, 'YYYY-MM-DD') as dia,
      COALESCE(SUM(RIHRI_VL), 0) as litros
     FROM TH_RIHRI
     WHERE RIHRI_FI >= NOW() - INTERVAL '30 days'
     GROUP BY TO_CHAR(RIHRI_FI, 'YYYY-MM-DD')
     ORDER BY dia`
  );

  return result.rows.map(r => ({
    dia: r.dia,
    litros: parseFloat(r.litros),
  }));
}

export async function obtenerEficiencia() {
  const result = await query(
    `SELECT
      cu.CULTI_NM as cultivo,
      COALESCE(SUM(h.RIHRI_VL), 0) as litros
     FROM TH_RIHRI h
     JOIN TM_CANTE c ON c.CANTE_ID = h.CANTE_ID
     JOIN TM_CULTI cu ON cu.CULTI_ID = c.CULTI_ID
     GROUP BY cu.CULTI_NM
     ORDER BY litros DESC`
  );

  const total = result.rows.reduce((sum, r) => sum + parseFloat(r.litros), 0);

  return result.rows.map(r => ({
    cultivo: r.cultivo,
    litros: parseFloat(r.litros),
    porcentaje: total > 0 ? Math.round((parseFloat(r.litros) / total) * 100) : 0,
  }));
}

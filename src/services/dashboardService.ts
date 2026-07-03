import { prisma } from '../db/prismaClient.js';

const MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export async function obtenerTendenciaAnual() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT
      EXTRACT(MONTH FROM RIHRI_FI) as mes_num,
      COALESCE(SUM(RIHRI_VL), 0) as litros
     FROM TH_RIHRI
     WHERE RIHRI_FI >= NOW() - INTERVAL '12 months'
     GROUP BY EXTRACT(MONTH FROM RIHRI_FI)
     ORDER BY mes_num
  `;

  const map: any = {};
  for (const r of result) map[parseInt(r.mes_num, 10)] = parseFloat(r.litros);

  return MONTHS.map((mes, i) => ({
    mes,
    litros: map[i + 1] || 0,
  }));
}

export async function obtenerTendenciaMensual() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT
      TO_CHAR(RIHRI_FI, 'YYYY-MM-DD') as dia,
      COALESCE(SUM(RIHRI_VL), 0) as litros
     FROM TH_RIHRI
     WHERE RIHRI_FI >= NOW() - INTERVAL '30 days'
     GROUP BY TO_CHAR(RIHRI_FI, 'YYYY-MM-DD')
     ORDER BY dia
  `;

  return result.map((r: any) => ({
    dia: r.dia,
    litros: parseFloat(r.litros),
  }));
}

export async function obtenerEficiencia() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT
      cu.CULTI_NM as cultivo,
      COALESCE(SUM(h.RIHRI_VL), 0) as litros
     FROM TH_RIHRI h
     JOIN TM_CANTE c ON c.CANTE_ID = h.CANTE_ID
     JOIN TM_CULTI cu ON cu.CULTI_ID = c.CULTI_ID
     GROUP BY cu.CULTI_NM
     ORDER BY litros DESC
  `;

  const total = result.reduce((sum: number, r: any) => sum + parseFloat(r.litros), 0);

  return result.map((r: any) => ({
    cultivo: r.cultivo,
    litros: parseFloat(r.litros),
    porcentaje: total > 0 ? Math.round((parseFloat(r.litros) / total) * 100) : 0,
  }));
}

export async function obtenerConsumoHoy() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(SUM(RIHRI_VL), 0) as litros
    FROM TH_RIHRI
    WHERE DATE(RIHRI_FI) = CURRENT_DATE
  `;

  return { litros: result[0]?.litros ? parseFloat(result[0].litros) : 0 };
}

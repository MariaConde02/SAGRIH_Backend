import { prisma } from '../db/prismaClient.js';

export async function obtenerNivelTanque() {
  const params = await prisma.tp_param.findMany({
    where: { param_cl: { startsWith: 'TANQUE_' } }
  });
  
  const flat: any = {};
  for (const r of params) flat[r.param_cl] = parseFloat(r.param_vl);

  const capacidad = flat.TANQUE_CAPACIDAD || 10000;
  const alertaBaja = flat.TANQUE_ALERTA_BAJA || 20;
  const alertaCritica = flat.TANQUE_ALERTA_CRITICA || 10;

  const sensorResult = await prisma.tt_lectu.findMany({
    where: {
      tt_dispo: {
        tm_tipod: { tipod_nm: 'Sensor Nivel Agua' }
      }
    },
    orderBy: { lectu_fh: 'desc' },
    take: 1
  });

  let nivel;
  let fecha;

  if (sensorResult.length > 0) {
    nivel = Number(sensorResult[0].lectu_vl);
    fecha = sensorResult[0].lectu_fh;
  } else {
    const consumoResult = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(RIHRI_VL), 0) as total
      FROM TH_RIHRI WHERE RIHRI_FI >= NOW() - INTERVAL '7 days'
    `;
    nivel = Math.max(0, capacidad - parseFloat(consumoResult[0].total));
    fecha = new Date().toISOString();
  }

  const porcentaje = Math.round((nivel / capacidad) * 100);

  const consumo24h = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(SUM(RIHRI_VL), 0) as total
    FROM TH_RIHRI WHERE RIHRI_FI >= NOW() - INTERVAL '24 hours'
  `;

  return {
    nivel: Math.round(nivel * 100) / 100,
    capacidad,
    porcentaje,
    alertaBaja,
    alertaCritica,
    consumo24h: parseFloat(consumo24h[0].total),
    fecha,
  };
}

export async function obtenerAmbiente() {
  // Prisma doesn't support DISTINCT ON, but we can group or just fetch the latest for each unit.
  // There are only 2 units (°C and %), so we can just do 2 queries or a quick native query.
  // Using $queryRaw is the safest to replicate EXACT behaviour of DISTINCT ON.
  const result = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ON (l.UNIDM_ID)
      l.LECTU_VL, l.LECTU_FH, u.UNIDM_AB, u.UNIDM_NM
     FROM TT_LECTU l
     JOIN TT_DISPO d ON d.DISPO_ID = l.DISPO_ID
     JOIN TM_TIPOD t ON t.TIPOD_ID = d.TIPOD_ID
     JOIN TM_UNIDM u ON u.UNIDM_ID = l.UNIDM_ID
     WHERE t.TIPOD_NM = 'Sensor Ambiente'
     ORDER BY l.UNIDM_ID, l.LECTU_FH DESC
  `;

  const temperatura = { valor: null as number | null, unidad: '°C', fecha: null as Date | null };
  const humedad = { valor: null as number | null, unidad: '%', fecha: null as Date | null };

  for (const r of result) {
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

export async function insertarLecturas(lecturas: any[]) {
  if (!lecturas || lecturas.length === 0) return { insertadas: 0 };

  const validLecturas = lecturas.filter(l => l.dispo_id && l.lectu_vl !== undefined && l.unidm_id);
  
  if (validLecturas.length === 0) return { insertadas: 0 };

  const result = await prisma.tt_lectu.createMany({
    data: validLecturas.map(l => ({
      dispo_id: l.dispo_id,
      lectu_vl: l.lectu_vl,
      unidm_id: l.unidm_id
    })),
    skipDuplicates: true
  });

  return { insertadas: result.count };
}

export async function obtenerRed() {
  const dispositivos = await prisma.tt_dispo.findMany({
    include: {
      tt_logco: {
        orderBy: { logco_fh: 'desc' },
        take: 1
      }
    },
    orderBy: { dispo_id: 'asc' }
  });

  const redDispositivos = dispositivos.map(r => ({
    id: r.dispo_id,
    nombre: r.dispo_tg || r.dispo_id,
    estadoAsignado: r.dispo_et,
    ultimoEvento: r.tt_logco.length > 0 ? r.tt_logco[0].logco_ev : 'desconocido',
  }));

  const online = redDispositivos.filter(d => d.ultimoEvento === 'online').length;
  const offline = redDispositivos.filter(d => d.ultimoEvento === 'offline').length;

  return {
    total: redDispositivos.length,
    online,
    offline,
    dispositivos: redDispositivos,
  };
}

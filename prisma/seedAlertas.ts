import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// Categorías de alerta (TM_TIPAL) referenciadas por nombre en el motor de
// alertas, el simulador y las rutas del backend.
const CATEGORIAS = [
  { nm: 'baja',         ds: 'Aviso preventivo, sin acción urgente' },
  { nm: 'media',        ds: 'Requiere atención programada' },
  { nm: 'alta',         ds: 'Requiere acción pronta del operador' },
  { nm: 'crítica',      ds: 'Requiere acción inmediata — despacha notificación a Telegram' },
  { nm: 'info',         ds: 'Notificación informativa' },
  { nm: 'Mantenimiento', ds: 'Tarea de mantenimiento — única categoría con botón "Marcar como Resuelta" en Telegram' },
];

// Umbrales de seguridad térmica (TP_PARAM) comparados por el motor de alertas
// contra las lecturas del DHT22 (Sensor Ambiente).
const PARAMS_TERMICOS = [
  { cl: 'TEMP_MIN_CRITICA', vl: '18', ds: 'Temperatura ambiente (°C) mínima segura: por debajo es alerta crítica' },
  { cl: 'TEMP_MAX_ALARMA',  vl: '30', ds: 'Temperatura ambiente (°C) alta: genera alerta de categoría alta' },
  { cl: 'TEMP_MAX_CRITICA', vl: '33', ds: 'Temperatura ambiente (°C) máxima segura: por encima es alerta crítica' },
];

async function main() {
  console.log('— Seed de categorías de alerta (TM_TIPAL) —');
  for (const cat of CATEGORIAS) {
    const r = await prisma.tm_tipal.upsert({
      where: { tipal_nm: cat.nm },
      update: { tipal_ds: cat.ds },
      create: { tipal_nm: cat.nm, tipal_ds: cat.ds },
    });
    console.log(`  TM_TIPAL "${cat.nm}" → id ${r.tipal_id}`);
  }

  console.log('— Seed de umbrales térmicos (TP_PARAM) —');
  for (const p of PARAMS_TERMICOS) {
    const r = await prisma.tp_param.upsert({
      where: { param_cl: p.cl },
      update: {},
      create: { param_cl: p.cl, param_vl: p.vl, param_ds: p.ds },
    });
    console.log(`  TP_PARAM ${p.cl} = ${r.param_vl}`);
  }

  console.log('seedAlertas: listo.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

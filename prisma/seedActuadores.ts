import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const TIPOS = ['Ventilador 12V', 'Luces LED'] as const;

const PARAMS: [string, string, string][] = [
  ['VENT_MODO', 'auto', 'Modo de control del ventilador (auto|manual)'],
  ['VENT_ESTADO', 'off', 'Estado actual del ventilador (on|off)'],
  ['VENT_TEMP_ON', '28', 'Temperatura (°C) a partir de la cual se enciende el ventilador'],
  ['VENT_TEMP_OFF', '26', 'Temperatura (°C) a partir de la cual se apaga el ventilador'],
  ['LUZ_MODO', 'auto', 'Modo de control de luces (auto|manual)'],
  ['LUZ_ESTADO', 'off', 'Estado actual de las luces (on|off)'],
  ['LUZ_TEMP_ON', '18', 'Temperatura (°C) a partir de la cual se encienden las luces (calefacción por frío)'],
  ['LUZ_TEMP_OFF', '20', 'Temperatura (°C) a partir de la cual se apagan las luces'],
];

async function main() {
  const tipos: Record<string, number> = {};
  for (const nombre of TIPOS) {
    const t = await prisma.tm_tipod.upsert({
      where: { tipod_nm: nombre },
      update: {},
      create: { tipod_nm: nombre },
    });
    tipos[nombre] = t.tipod_id;
  }

  const dispositivos: [string, string, string][] = [
    ['INV-01-VENT', 'VENT-01', 'Ventilador 12V'],
    ['INV-01-LUZ', 'LUZ-01', 'Luces LED'],
  ];

  for (const [id, tag, tipo] of dispositivos) {
    const data = {
      dispo_tg: tag,
      tipod_id: tipos[tipo],
      inver_id: 'INV-01',
      cante_id: null,
      dispo_et: 'Operativo',
      dispo_sm: true,
    };
    await prisma.tt_dispo.upsert({
      where: { dispo_id: id },
      update: data,
      create: { dispo_id: id, ...data },
    });
  }

  for (const [cl, vl, ds] of PARAMS) {
    await prisma.tp_param.upsert({
      where: { param_cl: cl },
      update: {},
      create: { param_cl: cl, param_vl: vl, param_ds: ds },
    });
  }

  console.log('Seed de actuadores completado.');
  console.log('  Tipos      :', Object.entries(tipos).map(([n, i]) => `${i}=${n}`).join(', '));
  console.log('  Dispositivos: INV-01-VENT (VENT-01), INV-01-LUZ (LUZ-01)');
  console.log('  Params     :', PARAMS.map(([cl]) => cl).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

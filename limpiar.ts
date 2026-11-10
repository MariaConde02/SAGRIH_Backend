import { PrismaClient } from './src/generated/prisma/index.js';

// Neon con cómputo suspendido tarda más de los 5s por defecto en el cold-start:
// se amplía el timeout de conexión antes de instanciar el cliente.
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('connect_timeout')) {
  process.env.DATABASE_URL += (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'connect_timeout=30';
}

const prisma = new PrismaClient();

async function truncar(lista: string) {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE;`);
}

async function limpiar() {
  const variantes = [
    ['minúsculas (creadas por Prisma)', '"tt_lectu", "tt_simet", "tt_logco", "tt_alert", "th_rihri"'],
    ['mayúsculas (como en el snippet original)', '"TT_LECTU", "TT_SIMET", "TT_LOGCO", "TT_ALERT", "TH_RIHRI"'],
  ];
  for (const [desc, lista] of variantes) {
    try {
      await truncar(lista);
      console.log(`✅ Tablas transaccionales purgadas (${desc}).`);
      await prisma.$disconnect();
      return;
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      console.error(`[${desc}] -> ${msg.split('\n').filter(Boolean).slice(-2).join(' | ')}`);
      if (msg.includes('does not exist')) continue; // otra grafía
      break; // cuota u otro error de servidor: no tiene sentido seguir
    }
  }
  console.error('❌ Vaciado no ejecutable mientras la BD esté bloqueada por cuota.');
  await prisma.$disconnect();
}
limpiar();

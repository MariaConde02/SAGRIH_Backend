import { prisma } from '../src/db/prismaClient.js';

async function main() {
  // Crear un cantero de prueba para INV-TEST01
  const r = await prisma.tm_cante.upsert({
    where: { cante_id: 'TEST-X99' },
    update: { deletedAt: null },
    create: {
      cante_id: 'TEST-X99',
      cante_nm: 'Test Cantero',
      inver_id: 'INV-TEST01',
      cante_an: 1.5,
      cante_la: 2.0,
      pos_xm: 0.5,
      pos_ym: 0.5,
      orienta: 'horizontal',
    }
  });
  console.log('Prisma OK:', r.cante_id);

  // Limpieza
  await prisma.tm_cante.update({
    where: { cante_id: 'TEST-X99' },
    data: { deletedAt: new Date() }
  });
  console.log('Limpiado.');
}

main().catch(e => { console.error('ERROR:', e.message, e.code); }).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Ver todos los invernaderos
  const invernaderos = await prisma.tm_inver.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { tm_cante: { where: { deletedAt: null } } } } },
    orderBy: [{ inver_ma: 'desc' }, { inver_id: 'asc' }]
  });

  console.log('\n=== INVERNADEROS ===');
  invernaderos.forEach(i => {
    console.log(`  ${i.inver_id} | "${i.inver_nm}" | maestro=${i.inver_ma} | canteros=${i._count.tm_cante}`);
  });

  // 2. Ver TODOS los canteros (incluyendo su invernaderoId)
  const canteros = await prisma.tm_cante.findMany({
    where: { deletedAt: null },
    select: { cante_id: true, cante_nm: true, inver_id: true },
    orderBy: { inver_id: 'asc' }
  });

  console.log('\n=== CANTEROS Y SU INVERNADERO ===');
  canteros.forEach(c => {
    console.log(`  ${c.cante_id} | "${c.cante_nm}" | inver_id=${c.inver_id}`);
  });

  // 3. Canteros sin invernadero válido (huérfanos)
  const inverIds = invernaderos.map(i => i.inver_id);
  const huerfanos = canteros.filter(c => !inverIds.includes(c.inver_id));
  if (huerfanos.length > 0) {
    console.log('\n=== CANTEROS HUÉRFANOS (invernaderoId no existe) ===');
    huerfanos.forEach(c => console.log(`  ${c.cante_id} | "${c.cante_nm}" | inver_id=${c.inver_id}`));
  } else {
    console.log('\nNo hay canteros huérfanos.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

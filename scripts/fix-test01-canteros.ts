import { prisma } from '../src/db/prismaClient.js';

async function main() {
  const TARGET_INVERNADERO = 'INV-TEST01';

  // ──────────────────────────────────────────────
  // 1. Verificar que el invernadero existe
  // ──────────────────────────────────────────────
  const inv = await prisma.tm_inver.findUnique({
    where: { inver_id: TARGET_INVERNADERO }
  });
  if (!inv) {
    console.error(`Invernadero ${TARGET_INVERNADERO} no encontrado.`);
    return;
  }
  console.log(`\nInvernadero encontrado: "${inv.inver_nm}" (${inv.inver_id})`);

  // ──────────────────────────────────────────────
  // 2. Crear 4 canteros para INV-TEST01
  //    (en desuso — sin cultivo, estado inactivo)
  // ──────────────────────────────────────────────
  const canterosDefs = [
    { id: 'CT01-A', nombre: 'Cantero A' },
    { id: 'CT01-B', nombre: 'Cantero B' },
    { id: 'CT01-C', nombre: 'Cantero C' },
    { id: 'CT01-D', nombre: 'Cantero D' },
  ];

  console.log('\nCreando canteros para INV-TEST01...');
  for (const c of canterosDefs) {
    await prisma.tm_cante.upsert({
      where: { cante_id: c.id },
      update: { inver_id: TARGET_INVERNADERO },
      create: {
        cante_id:  c.id,
        cante_nm:  c.nombre,
        inver_id:  TARGET_INVERNADERO,
        cante_est: false,          // Inactivo (sin cultivo)
        cante_an:  1.5,
        cante_la:  2.0,
        pos_xm:    null,           // auto-layout en frontend
        pos_ym:    null,
        orienta:   'horizontal',
      }
    });
    console.log(`  ✓ ${c.id} | "${c.nombre}" creado`);
  }

  // ──────────────────────────────────────────────
  // 3. Soft-delete del cantero huérfano
  // ──────────────────────────────────────────────
  const huerfano = await prisma.tm_cante.findUnique({
    where: { cante_id: 'cantero-1' }
  });
  if (huerfano && !huerfano.deletedAt) {
    await prisma.tm_cante.update({
      where: { cante_id: 'cantero-1' },
      data: { deletedAt: new Date() }
    });
    console.log('\n  ✓ Cantero huérfano "cantero-1" eliminado (soft-delete)');
  } else {
    console.log('\n  — Cantero huérfano ya eliminado o no encontrado');
  }

  // ──────────────────────────────────────────────
  // 4. Verificación final
  // ──────────────────────────────────────────────
  const resultado = await prisma.tm_cante.findMany({
    where: { inver_id: TARGET_INVERNADERO, deletedAt: null },
    select: { cante_id: true, cante_nm: true, cante_est: true }
  });
  console.log(`\n=== CANTEROS DE ${TARGET_INVERNADERO} (post-fix) ===`);
  resultado.forEach(c => {
    console.log(`  ${c.cante_id} | "${c.cante_nm}" | activo=${c.cante_est}`);
  });

  console.log('\n✅ Corrección completada exitosamente.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

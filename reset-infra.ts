import { prisma } from './src/db/prismaClient.js';

async function main() {
  console.log('Iniciando borrado quirúrgico de infraestructura y transacciones...');

  try {
    // Es importante respetar el orden de eliminación o usar el modo transacción de Prisma
    // Aunque muchas tablas tienen onDelete: Cascade, ser explícitos previene errores.
    
    // 1. Borrar lecturas, logs y alertas (transaccional)
    const delLectu = prisma.tt_lectu.deleteMany();
    const delLogco = prisma.tt_logco.deleteMany();
    const delAlert = prisma.tt_alert.deleteMany();
    const delMante = prisma.th_mante.deleteMany();
    const delRihri = prisma.th_rihri.deleteMany();

    // 2. Borrar programaciones de riego
    const delProgd = prisma.tt_progd.deleteMany();
    const delProgr = prisma.tt_progr.deleteMany();

    // 3. Borrar Dispositivos
    const delDispo = prisma.tt_dispo.deleteMany();

    // 4. Borrar Canteros
    const delCante = prisma.tm_cante.deleteMany();

    // 5. Borrar Invernaderos
    const delInver = prisma.tm_inver.deleteMany();

    // Ejecutar en una transacción para asegurar integridad
    await prisma.$transaction([
      delLectu,
      delLogco,
      delAlert,
      delMante,
      delRihri,
      delProgd,
      delProgr,
      delDispo,
      delCante,
      delInver
    ]);

    console.log('✅ Borrado exitoso.');
    console.log('Se han vaciado las siguientes tablas:');
    console.log('- TT_LECTU, TT_LOGCO, TT_ALERT, TH_MANTE, TH_RIHRI');
    console.log('- TT_PROGD, TT_PROGR');
    console.log('- TT_DISPO');
    console.log('- TM_CANTE');
    console.log('- TM_INVER');
    console.log('\n✅ Los catálogos de Cultivos, Tipos de Dispositivo, Usuarios y Parámetros permanecen INTACTOS.');
  } catch (error) {
    console.error('❌ Error durante el borrado quirúrgico:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

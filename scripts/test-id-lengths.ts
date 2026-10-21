import { prisma } from '../src/db/prismaClient.js';

async function main() {
  // Probar que inver_id de 20 chars cabe
  const testId = 'INV-' + Date.now(); // ej: INV-1729302123456 = 19 chars
  console.log(`inver_id length: ${testId.length} chars → "${testId}"`);

  // Probar que cante_id de 10 chars es el límite
  const canteId = `C-${testId.slice(-8)}`; // 10 chars exactos
  console.log(`cante_id length: ${canteId.length} chars → "${canteId}"`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

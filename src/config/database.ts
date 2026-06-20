import { prisma } from '../db/prismaClient.js';

export async function checkConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexión a la base de datos (Prisma) establecida');
  } catch (error) {
    console.error('❌ Error de conexión a la BD:', error);
    process.exit(1);
  }
}

export default prisma;

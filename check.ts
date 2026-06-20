import { prisma } from './src/db/prismaClient.js';
prisma.tm_inver.findMany().then(r => console.log(r)).finally(() => prisma.$disconnect());

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const categorias = [
  "Hortalizas",
  "Frutales",
  "Tubérculos/Raíces",
  "Medicinales y Aromáticas",
  "Ornamentales",
  "Forestales",
  "Otro"
];

async function main() {
  for (const cat of categorias) {
    await prisma.tm_categ.upsert({
      where: { categ_nm: cat },
      update: {},
      create: { categ_nm: cat }
    });
  }
  
  // Seed basic crops mapping to category
  const hortalizas = await prisma.tm_categ.findUnique({ where: { categ_nm: "Hortalizas" } });
  const frutales = await prisma.tm_categ.findUnique({ where: { categ_nm: "Frutales" } });
  
  if (hortalizas) {
    await prisma.tm_culti.updateMany({
      where: { culti_cg: null },
      data: { culti_cg: hortalizas.categ_id }
    });
  }

  console.log("Seeding completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

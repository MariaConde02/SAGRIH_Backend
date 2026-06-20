import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const actualizaciones = [
  { nombre: "Tomate cherry", categoria: "Frutales", tc: 60 },
  { nombre: "Lechuga crespa", categoria: "Hortalizas", tc: 45 },
  { nombre: "Pimentón", categoria: "Frutales", tc: 75 },
  { nombre: "Cilantro", categoria: "Medicinales y Aromáticas", tc: 40 },
  { nombre: "Albahaca", categoria: "Medicinales y Aromáticas", tc: 60 },
  { nombre: "Fresa", categoria: "Frutales", tc: 120 },
  { nombre: "Pepino", categoria: "Hortalizas", tc: 60 },
  { nombre: "Zanahoria", categoria: "Tubérculos/Raíces", tc: 75 }
];

async function main() {
  // Obtener todas las categorías para tener los IDs
  const categorias = await prisma.tm_categ.findMany();
  const mapaCategorias = new Map(categorias.map(c => [c.categ_nm, c.categ_id]));

  for (const item of actualizaciones) {
    const categId = mapaCategorias.get(item.categoria);
    if (!categId) {
      console.warn(`Categoría no encontrada: ${item.categoria} para ${item.nombre}`);
      continue;
    }

    await prisma.tm_culti.updateMany({
      where: { culti_nm: item.nombre },
      data: { 
        culti_cg: categId,
        culti_tc: item.tc
      }
    });
    console.log(`Actualizado ${item.nombre} -> Categoría: ${item.categoria}, TC: ${item.tc} días`);
  }

  console.log("Actualización de cultivos completada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

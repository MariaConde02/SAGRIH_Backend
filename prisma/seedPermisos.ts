import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// Rol exigido por las rutas de control (checkRole) pero ausente en la BD
const ROL_SUPERVISOR = 'Supervisor';

// Matriz rol → permisos (TM_ROLES × TM_PERMI → TT_ROLPE)
const MATRIZ: Record<string, string[]> = {
  Administrador: [
    'riego.control', 'riego.programar', 'infraestructura.gestion',
    'usuarios.gestion', 'parametros.configurar', 'alertas.gestion',
    'historial.ver', 'bitacora.ver',
  ],
  Ingeniero: [
    'riego.control', 'riego.programar', 'infraestructura.gestion',
    'usuarios.gestion', 'parametros.configurar', 'alertas.gestion',
    'historial.ver', 'bitacora.ver',
  ],
  Supervisor: [
    'riego.control', 'riego.programar', 'parametros.configurar', 'alertas.gestion',
    'historial.ver', 'bitacora.ver',
  ],
  Operario: ['historial.ver', 'bitacora.ver'],
  Invitado: ['historial.ver'],
};

async function main() {
  const supervisor = await prisma.tm_roles.upsert({
    where: { roles_nm: ROL_SUPERVISOR },
    update: {},
    create: { roles_nm: ROL_SUPERVISOR, roles_ds: 'Supervisa la operación diaria del invernadero' },
  });
  console.log(`Rol Supervisor: id ${supervisor.roles_id}`);

  let creados = 0;
  for (const [rolNm, permisos] of Object.entries(MATRIZ)) {
    const rol = await prisma.tm_roles.findUnique({ where: { roles_nm: rolNm } });
    if (!rol) {
      console.warn(`  Rol no encontrado, omitido: ${rolNm}`);
      continue;
    }
    for (const permiNm of permisos) {
      const permi = await prisma.tm_permi.findUnique({ where: { permi_nm: permiNm } });
      if (!permi) {
        console.warn(`  Permiso no encontrado, omitido: ${permiNm}`);
        continue;
      }
      await prisma.tt_rolpe.upsert({
        where: { roles_id_permi_id: { roles_id: rol.roles_id, permi_id: permi.permi_id } },
        update: {},
        create: { roles_id: rol.roles_id, permi_id: permi.permi_id },
      });
      creados++;
    }
  }
  const total = await prisma.tt_rolpe.count();
  console.log(`Matriz TT_ROLPE: ${creados} enlaces procesados, ${total} totales en BD.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

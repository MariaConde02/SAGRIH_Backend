import { Router } from 'express';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware, checkRole } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// Endpoint para obtener todos los registros eliminados lógicamente
router.get('/', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const usuarios = await prisma.tm_usuar.findMany({
      where: { usuar_est: 'eliminado' },
      select: {
        usuar_id: true,
        usuar_nm: true,
        usuar_ap: true,
        usuar_em: true,
        tm_roles: { select: { roles_nm: true } }
      }
    });

    const cultivos = await prisma.tm_culti.findMany({
      where: { deletedAt: { not: null } },
      include: { tm_categ: true }
    });

    const programas = await prisma.tt_progr.findMany({
      where: { deletedAt: { not: null } },
      include: { tm_cante: true }
    });

    const dispositivos = await prisma.tt_dispo.findMany({
      where: { deletedAt: { not: null } },
      include: { tm_tipod: true }
    });

    const invernaderos = await prisma.tm_inver.findMany({
      where: { deletedAt: { not: null } }
    });

    res.json({
      usuarios: usuarios.map(u => ({
        id: u.usuar_id,
        nombre: `${u.usuar_nm} ${u.usuar_ap || ''}`.trim(),
        email: u.usuar_em,
        rol: u.tm_roles?.roles_nm
      })),
      cultivos: cultivos.map(c => ({
        id: c.culti_id,
        nombre: c.culti_nm,
        categoria: c.tm_categ?.categ_nm || 'Sin categoría',
        deletedAt: c.deletedAt
      })),
      programas: programas.map(p => ({
        id: p.progr_id,
        nombre: `Programa ${p.progr_id} (${p.tm_cante?.cante_nm})`,
        deletedAt: p.deletedAt
      })),
      dispositivos: dispositivos.map(d => ({
        id: d.dispo_id,
        nombre: d.dispo_tg || d.dispo_id,
        tipo: d.tm_tipod?.tipod_nm || 'Sin tipo',
        deletedAt: d.deletedAt
      })),
      invernaderos: invernaderos.map(i => ({
        id: i.inver_id,
        nombre: i.inver_nm,
        deletedAt: i.deletedAt
      }))
    });
  } catch (error: any) {
    console.error('Error al listar papelera:', error.message);
    res.status(500).json({ error: 'Error al listar papelera' });
  }
});

// Endpoint para restaurar un registro
router.post('/restaurar', checkRole(['Administrador', 'Supervisor']), async (req, res) => {
  try {
    const { tipo, id } = req.body;

    if (!tipo || id === undefined) {
      return res.status(400).json({ error: 'Tipo e ID son requeridos' });
    }

    let message = '';
    const userId = (req as any).user.id;

    switch (tipo) {
      case 'usuario': {
        const user = await prisma.tm_usuar.findUnique({ where: { usuar_id: Number(id) } });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        await prisma.tm_usuar.update({
          where: { usuar_id: Number(id) },
          data: { usuar_est: 'activo' }
        });
        
        await prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Restauración de Usuario',
            audit_ds: `Se restauró el usuario ${user.usuar_nm} ${user.usuar_ap || ''} (${user.usuar_em}) desde la papelera`
          }
        });
        message = 'Usuario restaurado';
        break;
      }
      case 'cultivo': {
        const cultivo = await prisma.tm_culti.findUnique({ where: { culti_id: Number(id) } });
        if (!cultivo) return res.status(404).json({ error: 'Cultivo no encontrado' });

        await prisma.tm_culti.update({
          where: { culti_id: Number(id) },
          data: { deletedAt: null }
        });
        
        await prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Restauración de Cultivo',
            audit_ds: `Se restauró el cultivo ${cultivo.culti_nm} desde la papelera`
          }
        });
        message = 'Cultivo restaurado';
        break;
      }
      case 'programa': {
        const progrId = parseInt(id as string, 10);
        const programa = await prisma.tt_progr.findUnique({ where: { progr_id: progrId } });
        if (!programa) return res.status(404).json({ error: 'Programa no encontrado' });

        await prisma.tt_progr.update({
          where: { progr_id: progrId },
          data: { deletedAt: null }
        });

        await prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Restauración de Programa',
            audit_ds: `Se restauró el programa de riego ${progrId} desde la papelera`
          }
        });
        message = 'Programa restaurado';
        break;
      }
      case 'dispositivo': {
        const dispo = await prisma.tt_dispo.findUnique({ where: { dispo_id: String(id) } });
        if (!dispo) return res.status(404).json({ error: 'Dispositivo no encontrado' });

        await prisma.tt_dispo.update({
          where: { dispo_id: String(id) },
          data: { deletedAt: null }
        });

        await prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Restauración de Dispositivo',
            audit_ds: `Se restauró el dispositivo ${dispo.dispo_tg || dispo.dispo_id} desde la papelera`
          }
        });
        message = 'Dispositivo restaurado';
        break;
      }
      case 'invernadero': {
        const inver = await prisma.tm_inver.findUnique({ where: { inver_id: String(id) } });
        if (!inver) return res.status(404).json({ error: 'Invernadero no encontrado' });

        await prisma.tm_inver.update({
          where: { inver_id: String(id) },
          data: { deletedAt: null }
        });

        await prisma.th_audit.create({
          data: {
            usuar_id: userId,
            audit_ac: 'Restauración de Invernadero',
            audit_ds: `Se restauró el invernadero ${inver.inver_nm || inver.inver_id} desde la papelera`
          }
        });
        message = 'Invernadero restaurado';
        break;
      }
      default:
        return res.status(400).json({ error: 'Tipo de entidad no válido' });
    }

    res.json({ success: true, message });
  } catch (error: any) {
    console.error('Error al restaurar elemento:', error.message);
    res.status(500).json({ error: 'Error interno al restaurar elemento' });
  }
});

export default router;

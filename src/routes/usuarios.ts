import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const usuarios = await prisma.tm_usuar.findMany({
      include: {
        tm_roles: true
      },
      orderBy: { usuar_id: 'asc' }
    });
    
    res.json(usuarios.map(r => ({
      id: r.usuar_id,
      nombre: `${r.usuar_nm} ${r.usuar_ap || ''}`.trim(),
      email: r.usuar_em,
      rol: r.tm_roles?.roles_nm,
      estado: r.usuar_est,
      ultimoAcceso: r.usuar_at,
    })));
  } catch (error: any) {
    console.error('Error al listar usuarios:', error.message);
    res.json([]);
  }
});

router.get('/roles', async (_req, res) => {
  try {
    const roles = await prisma.tm_roles.findMany({
      orderBy: { roles_id: 'asc' }
    });
    res.json(roles.map(r => ({ id: r.roles_id, nombre: r.roles_nm, descripcion: r.roles_ds })));
  } catch (error: any) {
    console.error('Error al listar roles:', error.message);
    res.json([]);
  }
});

router.get('/permisos', async (_req, res) => {
  try {
    const permisos = await prisma.tm_permi.findMany({
      orderBy: { permi_id: 'asc' }
    });
    res.json(permisos.map(r => ({ id: r.permi_id, nombre: r.permi_nm, descripcion: r.permi_ds })));
  } catch (error: any) {
    console.error('Error al listar permisos:', error.message);
    res.json([]);
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, apellido, email, password, rolId, medioNotificacion } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña requeridos' });
    
    const exists = await prisma.tm_usuar.findUnique({
      where: { usuar_em: email }
    });
    if (exists) return res.status(409).json({ error: 'El email ya está registrado' });
    
    const hashed = await bcrypt.hash(password, 10);
    
    const newUser = await prisma.tm_usuar.create({
      data: {
        usuar_nm: nombre,
        usuar_ap: apellido || null,
        usuar_em: email,
        usuar_pw: hashed,
        roles_id: rolId || 3,
        usuar_mn: medioNotificacion || 'email'
      }
    });
    
    res.status(201).json({ id: newUser.usuar_id });
  } catch (error: any) {
    console.error('Error al crear usuario:', error.message);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, apellido, email, password, rolId, estado, medioNotificacion } = req.body;
    
    const dataToUpdate: any = {
      usuar_nm: nombre !== undefined ? nombre : undefined,
      usuar_ap: apellido !== undefined ? apellido : undefined,
      usuar_em: email !== undefined ? email : undefined,
      roles_id: rolId !== undefined ? rolId : undefined,
      usuar_est: estado !== undefined ? estado : undefined,
      usuar_mn: medioNotificacion !== undefined ? medioNotificacion : undefined,
    };
    
    if (password) {
      dataToUpdate.usuar_pw = await bcrypt.hash(password, 10);
    }
    
    await prisma.tm_usuar.update({
      where: { usuar_id: parseInt(req.params.id, 10) },
      data: dataToUpdate
    });
    
    res.json({ message: 'Usuario actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar usuario:', error.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.tm_usuar.delete({
      where: { usuar_id: parseInt(req.params.id, 10) }
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
       return res.json({ success: true }); // already deleted
    }
    console.error('Error al eliminar usuario:', error.message);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

export default router;

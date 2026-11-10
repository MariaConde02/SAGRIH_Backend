import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prismaClient.js';
import { authMiddleware, checkRole, verificarPermiso } from '../middleware/auth.js';
import { EmailService } from '../services/emailService.js';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res) => {
  try {
    const usuarios = await prisma.tm_usuar.findMany({
      where: { NOT: { usuar_est: 'eliminado' } },
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

// Vinculación de Telegram (USUAR_TI): cada usuario registra su propio Chat ID
router.patch('/telegram', async (req, res) => {
  try {
    const { chatId } = req.body;
    const limpio = String(chatId ?? '').trim();
    if (!/^-?\d{5,20}$/.test(limpio)) {
      return res.status(400).json({ error: 'El Chat ID debe ser el número numérico que te envió el bot (5 a 20 dígitos).' });
    }

    await prisma.tm_usuar.update({
      where: { usuar_id: req.user.id },
      data: { usuar_ti: limpio }
    });

    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Vinculación Telegram',
        audit_ds: `Usuario ${req.user.nombre} ${req.user.apellido || ''} registró su Chat ID de Telegram (USUAR_TI)`
      }
    });

    res.json({ message: 'Chat ID de Telegram guardado correctamente', chatId: limpio });
  } catch (error: any) {
    console.error('Error al guardar Chat ID de Telegram:', error.message);
    res.status(500).json({ error: 'Error al guardar el Chat ID de Telegram' });
  }
});

router.post('/', checkRole(['Administrador', 'Ingeniero']), verificarPermiso('usuarios.gestion'), async (req, res) => {
  try {
    const { nombre, apellido, email, rolId, medioNotificacion, password } = req.body;
    if (!nombre || !email) return res.status(400).json({ error: 'Nombre y email requeridos' });
    
    const exists = await prisma.tm_usuar.findUnique({
      where: { usuar_em: email }
    });
    if (exists) return res.status(409).json({ error: 'El email ya está registrado' });
    
    // Check admin limit
    const selectedRole = await prisma.tm_roles.findUnique({ where: { roles_id: rolId || 3 } });
    if (req.user.rolNombre === 'Ingeniero' && (selectedRole?.roles_nm === 'Administrador' || selectedRole?.roles_nm === 'Ingeniero')) {
      return res.status(403).json({ error: 'Ingenieros solo pueden crear Operarios o Supervisores' });
    }
    if (selectedRole?.roles_nm === 'Administrador') {
      const currentAdmins = await prisma.tm_usuar.count({
        where: { tm_roles: { roles_nm: 'Administrador' }, usuar_est: 'activo' }
      });
      if (currentAdmins >= 2) {
        return res.status(403).json({ error: 'Límite de administradores alcanzado (máximo 2)' });
      }
    }

    // Contraseña: si el administrador define una, se valida y se usa tal cual
    // (sin cambio forzado). Si no, se genera una provisional segura y se envía
    // por correo (mínimo 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial).
    let provPassword: string | null = null;
    let hashed: string;

    if (password !== undefined && password !== null && String(password).length > 0) {
      const pwd = String(password);
      if (pwd.length < 8 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
        return res.status(400).json({
          error: 'La contraseña debe tener mínimo 8 caracteres, incluir letras (A-Z) y números (0-9). Se admiten símbolos (#, $, @).'
        });
      }
      hashed = await bcrypt.hash(pwd, 10);
    } else {
      const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lower = 'abcdefghijklmnopqrstuvwxyz';
      const numbers = '0123456789';
      const specials = '!@#$%^&*()_+~';
      provPassword =
        upper[Math.floor(Math.random() * upper.length)] +
        numbers[Math.floor(Math.random() * numbers.length)] +
        specials[Math.floor(Math.random() * specials.length)];

      const allChars = upper + lower + numbers + specials;
      for (let i = 0; i < 5; i++) {
        provPassword += allChars[Math.floor(Math.random() * allChars.length)];
      }
      // Mezclar la contraseña para que no siga un patrón obvio
      provPassword = provPassword.split('').sort(() => 0.5 - Math.random()).join('');
      hashed = await bcrypt.hash(provPassword, 10);
    }

    const newUser = await prisma.tm_usuar.create({
      data: {
        usuar_nm: nombre,
        usuar_ap: apellido || null,
        usuar_em: email,
        usuar_pw: hashed,
        roles_id: rolId || 3,
        usuar_mn: medioNotificacion || 'email',
        usuar_reqpw: provPassword !== null
      }
    });
    
    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Creación de Usuario',
        audit_ds: `Creación del perfil para ${nombre} ${apellido || ''} (${email})`
      }
    });

    // Enviar correo con EmailJS (credenciales + onboarding de Telegram)
    let emailSent = false;
    let warning = null;
    const instruccionesTelegram =
      '<br><br><strong>Para recibir alertas críticas de SAGRIH en tu teléfono:</strong>' +
      '<ol style="margin:8px 0 0 18px;padding:0;line-height:1.7">' +
      '<li>Abre Telegram y busca nuestro bot: <strong>@SagrihAlertasBot</strong>.</li>' +
      '<li>Envía el comando <strong>/start</strong>.</li>' +
      '<li>El bot te responderá con tu identificador numérico (Chat ID).</li>' +
      '<li>Copia ese número y pégalo en el campo «Chat ID Telegram» de tu Perfil en SAGRIH.</li>' +
      '</ol>';
    try {
      // Enviar correo electrónico usando el método dinámico
      await EmailService.sendDynamicEmail({
        to_email: email,
        to_name: nombre,
        subject: '¡Bienvenido a SAGRIH! Tu cuenta ha sido creada',
        title: '¡Te damos la bienvenida a SAGRIH!',
        message: provPassword !== null
          ? 'Tu cuenta ha sido creada exitosamente. Por seguridad, hemos generado una contraseña provisional para tu primer acceso. Deberás cambiarla al iniciar sesión.' + instruccionesTelegram
          : 'Tu cuenta ha sido creada exitosamente con la contraseña definida por el administrador. Ya puedes iniciar sesión en SAGRIH.' + instruccionesTelegram,
        extra_data: provPassword !== null
          ? `Tu contraseña provisional es: <strong>${provPassword}</strong>`
          : 'Inicia sesión con la contraseña que te proporcionó el administrador.',
        link: 'http://localhost:5173/login',
        contextName: 'correo de creación de usuario'
      });
      emailSent = true;
    } catch (error: any) {
      console.error('Error al enviar correo por EmailJS:', error.message);
      warning = 'Usuario creado, pero el correo no pudo enviarse. Contacte soporte.';
    }

    res.status(201).json({ 
      id: newUser.usuar_id, 
      warning 
    });
  } catch (error: any) {
    console.error('Error al crear usuario:', error.message);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

router.put('/:id', checkRole(['Administrador', 'Ingeniero']), verificarPermiso('usuarios.gestion'), async (req, res) => {
  try {
    const { nombre, apellido, email, password, rolId, estado, medioNotificacion } = req.body;
    
    const targetUser = await prisma.tm_usuar.findUnique({
      where: { usuar_id: parseInt(req.params.id, 10) },
      include: { tm_roles: true }
    });
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const firstAdmin = await prisma.tm_usuar.findFirst({
      where: { tm_roles: { roles_nm: 'Administrador' }, usuar_est: 'activo' },
      orderBy: { usuar_id: 'asc' }
    });

    if (firstAdmin && parseInt(req.params.id, 10) === firstAdmin.usuar_id) {
      return res.status(400).json({ error: 'El usuario principal del sistema no puede ser modificado' });
    }

    if (req.user.rolNombre === 'Ingeniero') {
      if (targetUser.tm_roles?.roles_nm === 'Administrador' || targetUser.tm_roles?.roles_nm === 'Ingeniero') {
        return res.status(403).json({ error: 'No tiene permisos para editar este usuario' });
      }
      if (rolId) {
        const selectedRole = await prisma.tm_roles.findUnique({ where: { roles_id: rolId } });
        if (selectedRole?.roles_nm === 'Administrador' || selectedRole?.roles_nm === 'Ingeniero') {
          return res.status(403).json({ error: 'No puede asignar este rol' });
        }
      }
    }
    
    const dataToUpdate: any = {
      usuar_nm: nombre !== undefined ? nombre : undefined,
      usuar_ap: apellido !== undefined ? apellido : undefined,
      usuar_em: email !== undefined ? email : undefined,
      roles_id: rolId !== undefined ? rolId : undefined,
      usuar_est: estado !== undefined ? estado : undefined,
      usuar_mn: medioNotificacion !== undefined ? medioNotificacion : undefined,
    };
    
    // Check if downgrading or suspending the last admin
    const estadosBloqueantes = ['suspendido', 'inactivo', 'eliminado'];
    if (targetUser.tm_roles?.roles_nm === 'Administrador' && (dataToUpdate.roles_id !== undefined || estadosBloqueantes.includes(dataToUpdate.usuar_est))) {
      // Si está cambiando su rol a uno distinto, o si se está suspendiendo
      let isDowngrading = false;
      if (dataToUpdate.roles_id !== undefined && dataToUpdate.roles_id !== targetUser.roles_id) {
        const newRole = await prisma.tm_roles.findUnique({ where: { roles_id: dataToUpdate.roles_id } });
        if (newRole?.roles_nm !== 'Administrador') isDowngrading = true;
      }
      
      if (isDowngrading || estadosBloqueantes.includes(dataToUpdate.usuar_est)) {
        const adminCount = await prisma.tm_usuar.count({
          where: { usuar_est: 'activo', tm_roles: { roles_nm: 'Administrador' } }
        });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'No puedes cambiar de rol ni suspender al último administrador del sistema' });
        }
      }
    }
    
    if (password) {
      dataToUpdate.usuar_pw = await bcrypt.hash(password, 10);
    }
    
    const updatedUser = await prisma.tm_usuar.update({
      where: { usuar_id: parseInt(req.params.id, 10) },
      data: dataToUpdate
    });
    
    // Registrar en auditoría (bitácora)
    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Actualización de Usuario',
        audit_ds: `Se actualizaron los datos del usuario ${updatedUser.usuar_nm} ${updatedUser.usuar_ap || ''} (${updatedUser.usuar_em})`
      }
    });

    res.json({ message: 'Usuario actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar usuario:', error.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Suspensión lógica (soft delete): alterna USUAR_ES entre 'activo' e 'inactivo'
// sin tocar el registro ni su historial de auditoría (TH_AUDIT).
router.patch('/:id/estado', checkRole(['Administrador', 'Ingeniero']), verificarPermiso('usuarios.gestion'), async (req, res) => {
  try {
    const usuar_id = parseInt(req.params.id, 10);
    if (!Number.isInteger(usuar_id)) {
      return res.status(400).json({ error: 'Identificador de usuario inválido' });
    }

    const targetUser = await prisma.tm_usuar.findUnique({
      where: { usuar_id },
      include: { tm_roles: true }
    });
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const firstAdmin = await prisma.tm_usuar.findFirst({
      where: { tm_roles: { roles_nm: 'Administrador' }, usuar_est: 'activo' },
      orderBy: { usuar_id: 'asc' }
    });
    if (firstAdmin && usuar_id === firstAdmin.usuar_id) {
      return res.status(400).json({ error: 'El usuario principal del sistema no puede ser suspendido' });
    }

    if (req.user.rolNombre === 'Ingeniero') {
      if (targetUser.tm_roles?.roles_nm === 'Administrador' || targetUser.tm_roles?.roles_nm === 'Ingeniero') {
        return res.status(403).json({ error: 'No tiene permisos para gestionar este usuario' });
      }
    }

    const estadoActual = targetUser.usuar_est || 'activo';
    const { estado } = req.body || {};
    const nuevoEstado = estado === 'activo' || estado === 'inactivo'
      ? estado
      : (estadoActual === 'activo' ? 'inactivo' : 'activo');

    if (nuevoEstado !== 'activo' && targetUser.tm_roles?.roles_nm === 'Administrador') {
      const adminCount = await prisma.tm_usuar.count({
        where: { usuar_est: 'activo', tm_roles: { roles_nm: 'Administrador' } }
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'No puedes suspender al último administrador del sistema' });
      }
    }

    await prisma.tm_usuar.update({
      where: { usuar_id },
      data: { usuar_est: nuevoEstado }
    });

    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: nuevoEstado === 'inactivo' ? 'Suspensión de Usuario' : 'Reactivación de Usuario',
        audit_ds: nuevoEstado === 'inactivo'
          ? `Se suspendió al usuario ${targetUser.usuar_nm} ${targetUser.usuar_ap || ''} (${targetUser.usuar_em}) — USUAR_ES = inactivo`
          : `Se reactivó al usuario ${targetUser.usuar_nm} ${targetUser.usuar_ap || ''} (${targetUser.usuar_em}) — USUAR_ES = activo`
      }
    });

    res.json({
      id: usuar_id,
      estado: nuevoEstado,
      message: nuevoEstado === 'inactivo' ? 'Usuario suspendido' : 'Usuario reactivado'
    });
  } catch (error: any) {
    console.error('Error al cambiar estado del usuario:', error.message);
    res.status(500).json({ error: 'Error al cambiar el estado del usuario' });
  }
});

router.delete('/:id', checkRole(['Administrador', 'Ingeniero']), verificarPermiso('usuarios.gestion'), async (req, res) => {
  try {
    const usuar_id = parseInt(req.params.id, 10);
    
    // Buscar al usuario antes de eliminar para obtener sus datos
    const userToDelete = await prisma.tm_usuar.findUnique({
      where: { usuar_id },
      include: { tm_roles: true }
    });

    if (!userToDelete) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const firstAdmin = await prisma.tm_usuar.findFirst({
      where: { tm_roles: { roles_nm: 'Administrador' }, usuar_est: 'activo' },
      orderBy: { usuar_id: 'asc' }
    });

    if (firstAdmin && usuar_id === firstAdmin.usuar_id) {
      return res.status(400).json({ error: 'El usuario principal del sistema no puede ser eliminado' });
    }

    if (req.user.rolNombre === 'Ingeniero') {
      if (userToDelete.tm_roles?.roles_nm === 'Administrador' || userToDelete.tm_roles?.roles_nm === 'Ingeniero') {
        return res.status(403).json({ error: 'No tiene permisos para eliminar este usuario' });
      }
    }

    if (userToDelete.tm_roles?.roles_nm === 'Administrador') {
      const adminCount = await prisma.tm_usuar.count({
        where: {
          usuar_est: 'activo',
          tm_roles: { roles_nm: 'Administrador' }
        }
      });
      
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'No puedes eliminar al último administrador del sistema' });
      }
    }

    await prisma.tm_usuar.update({
      where: { usuar_id },
      data: { usuar_est: 'eliminado' }
    });

    // Registrar en auditoría (bitácora)
    await prisma.th_audit.create({
      data: {
        usuar_id: req.user.id,
        audit_ac: 'Eliminación de Usuario',
        audit_ds: `Se eliminó al usuario ${userToDelete.usuar_nm} ${userToDelete.usuar_ap || ''} (${userToDelete.usuar_em})`
      }
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

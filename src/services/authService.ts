import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db/prismaClient.js';
import { generateToken } from '../middleware/auth.js';
import { EmailService } from './emailService.js';

export async function loginUser(email: string, password: string) {
  if (!email || !password) {
    const err: any = new Error('Email y contraseña requeridos');
    err.statusCode = 400;
    throw err;
  }
  
  const user = await prisma.tm_usuar.findFirst({
    where: { usuar_em: email, usuar_est: 'activo' },
    include: { tm_roles: true }
  });
  
  if (!user) {
    const err: any = new Error('Credenciales inválidas o usuario inactivo');
    err.statusCode = 401;
    throw err;
  }
  
  const validPassword = await bcrypt.compare(password, user.usuar_pw);
  if (!validPassword) {
    const err: any = new Error('Credenciales inválidas');
    err.statusCode = 401;
    throw err;
  }
  
  await prisma.tm_usuar.update({
    where: { usuar_id: user.usuar_id },
    data: { usuar_at: new Date() }
  });
  
  const token = generateToken(user);
  return {
    token,
    requirePasswordChange: user.usuar_reqpw,
    user: {
      id: user.usuar_id,
      nombre: user.usuar_nm,
      apellido: user.usuar_ap,
      email: user.usuar_em,
      rol: user.tm_roles?.roles_nm,
      medioNotificacion: user.usuar_mn,
    },
  };
}

export async function registerUser(nombre: string, apellido: string, email: string, password: string, rolId: number) {
  if (!nombre || !email || !password) {
    const err: any = new Error('Nombre, email y contraseña requeridos');
    err.statusCode = 400;
    throw err;
  }
  
  const exists = await prisma.tm_usuar.findUnique({
    where: { usuar_em: email }
  });
  
  if (exists) {
    const err: any = new Error('El email ya está registrado');
    err.statusCode = 409;
    throw err;
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const newUser = await prisma.tm_usuar.create({
    data: {
      usuar_nm: nombre,
      usuar_ap: apellido || null,
      usuar_em: email,
      usuar_pw: hashedPassword,
      roles_id: rolId || 3
    }
  });
  
  return { message: 'Usuario registrado exitosamente', user: newUser };
}

export async function getCurrentUser(authorizationHeader: string) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    const err: any = new Error('Token requerido');
    err.statusCode = 401;
    throw err;
  }
  const jwt = await import('jsonwebtoken');
  const decoded = jwt.default.verify(
    authorizationHeader.split(' ')[1],
    process.env.JWT_SECRET || 'sagrih-jwt-secret-key-2026'
  ) as any;
  
  const u = await prisma.tm_usuar.findUnique({
    where: { usuar_id: decoded.id },
    include: { tm_roles: true }
  });
  
  if (!u) {
    const err: any = new Error('Usuario no encontrado');
    err.statusCode = 404;
    throw err;
  }
  
  return {
    id: u.usuar_id,
    nombre: u.usuar_nm,
    apellido: u.usuar_ap,
    email: u.usuar_em,
    rol: u.tm_roles?.roles_nm,
    medioNotificacion: u.usuar_mn,
  };
}

export async function changePassword(userId: number, currentPassword?: string, newPassword?: string) {
  if (!newPassword || newPassword.length < 8) {
    const err: any = new Error('La nueva contraseña debe tener al menos 8 caracteres');
    err.statusCode = 400;
    throw err;
  }
  
  const user = await prisma.tm_usuar.findUnique({ where: { usuar_id: userId } });
  if (!user) {
    const err: any = new Error('Usuario no encontrado');
    err.statusCode = 404;
    throw err;
  }
  
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  await prisma.tm_usuar.update({
    where: { usuar_id: userId },
    data: {
      usuar_pw: hashedPassword,
      usuar_reqpw: false
    }
  });
  
  return { message: 'Contraseña actualizada correctamente' };
}

export async function recoverPassword(email: string) {
  const user = await prisma.tm_usuar.findFirst({
    where: { usuar_em: email, usuar_est: 'activo' }
  });

  if (!user) {
    const error: any = new Error('Lo sentimos, ese correo no está registrado. Intente con uno que sea correcto.');
    error.statusCode = 404;
    throw error;
  }

  // Generamos una nueva clave provisional fuerte
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  let provisionalPassword = '';
  for (let i = 0; i < 8; i++) {
    provisionalPassword += chars.charAt(crypto.randomInt(0, chars.length));
  }
  // Asegurar que cumpla (mayúscula, número, especial)
  provisionalPassword += 'A1!'; // Append to guarantee requirements

  const hashedPassword = await bcrypt.hash(provisionalPassword, 10);

  await prisma.tm_usuar.update({
    where: { usuar_id: user.usuar_id },
    data: {
      usuar_pw: hashedPassword,
      usuar_reqpw: true
    }
  });

  await EmailService.sendDynamicEmail({
    to_email: email,
    to_name: user.usuar_nm,
    subject: 'Recuperación de Contraseña - SAGRIH',
    title: 'Recuperación de Contraseña',
    message: 'Hemos recibido una solicitud para recuperar tu contraseña. Por seguridad, hemos generado una contraseña provisional para tu acceso. Recuerda que deberás cambiarla inmediatamente tras iniciar sesión.',
    extra_data: `Tu contraseña provisional es: <strong>${provisionalPassword}</strong>`,
    link: 'http://localhost:5173/login',
    contextName: 'correo de recuperación de contraseña'
  });

  return { message: 'Si el correo existe, se han enviado las instrucciones de recuperación.' };
}

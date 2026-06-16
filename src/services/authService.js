import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { generateToken } from '../middleware/auth.js';

export async function loginUser(email, password) {
  if (!email || !password) {
    const err = new Error('Email y contraseña requeridos');
    err.statusCode = 400;
    throw err;
  }
  const result = await query(
    `SELECT u.*, r.ROLES_NM FROM TM_USUAR u
     JOIN TM_ROLES r ON r.ROLES_ID = u.ROLES_ID
     WHERE u.USUAR_EM = $1 AND u.USUAR_EST = 'activo'`,
    [email]
  );
  if (result.rows.length === 0) {
    const err = new Error('Credenciales inválidas o usuario inactivo');
    err.statusCode = 401;
    throw err;
  }
  const user = result.rows[0];
  const validPassword = await bcrypt.compare(password, user.usuar_pw);
  if (!validPassword) {
    const err = new Error('Credenciales inválidas');
    err.statusCode = 401;
    throw err;
  }
  await query('UPDATE TM_USUAR SET USUAR_AT = CURRENT_TIMESTAMP WHERE USUAR_ID = $1', [user.usuar_id]);
  const token = generateToken(user);
  return {
    token,
    user: {
      id: user.usuar_id,
      nombre: user.usuar_nm,
      apellido: user.usuar_ap,
      email: user.usuar_em,
      rol: user.roles_nm,
      medioNotificacion: user.usuar_mn,
    },
  };
}

export async function registerUser(nombre, apellido, email, password, rolId) {
  if (!nombre || !email || !password) {
    const err = new Error('Nombre, email y contraseña requeridos');
    err.statusCode = 400;
    throw err;
  }
  const exists = await query('SELECT 1 FROM TM_USUAR WHERE USUAR_EM = $1', [email]);
  if (exists.rows.length > 0) {
    const err = new Error('El email ya está registrado');
    err.statusCode = 409;
    throw err;
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO TM_USUAR (USUAR_NM, USUAR_AP, USUAR_EM, USUAR_PW, ROLES_ID)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING USUAR_ID, USUAR_NM, USUAR_AP, USUAR_EM, USUAR_FC`,
    [nombre, apellido || null, email, hashedPassword, rolId || 3]
  );
  return { message: 'Usuario registrado exitosamente', user: result.rows[0] };
}

export async function getCurrentUser(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    const err = new Error('Token requerido');
    err.statusCode = 401;
    throw err;
  }
  const jwt = await import('jsonwebtoken');
  const decoded = jwt.default.verify(
    authorizationHeader.split(' ')[1],
    process.env.JWT_SECRET || 'sagrih-jwt-secret-key-2026'
  );
  const result = await query(
    `SELECT u.USUAR_ID, u.USUAR_NM, u.USUAR_AP, u.USUAR_EM, u.USUAR_MN, r.ROLES_NM
     FROM TM_USUAR u JOIN TM_ROLES r ON r.ROLES_ID = u.ROLES_ID
     WHERE u.USUAR_ID = $1`,
    [decoded.id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Usuario no encontrado');
    err.statusCode = 404;
    throw err;
  }
  const u = result.rows[0];
  return {
    id: u.usuar_id,
    nombre: u.usuar_nm,
    apellido: u.usuar_ap,
    email: u.usuar_em,
    rol: u.roles_nm,
    medioNotificacion: u.usuar_mn,
  };
}

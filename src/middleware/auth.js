import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.usuar_id,
      nombre: user.usuar_nm,
      apellido: user.usuar_ap,
      email: user.usuar_em,
      rolId: user.roles_id,
      rolNombre: user.roles_nm,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function requirePermiso(permisoNm) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
    try {
      const result = await pool.query(
        `SELECT 1 FROM TT_ROLPE rp
         JOIN TM_PERMI p ON p.PERMI_ID = rp.PERMI_ID
         WHERE rp.ROLES_ID = $1 AND p.PERMI_NM = $2`,
        [req.user.rolId, permisoNm]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: `Permiso requerido: ${permisoNm}` });
      }
      next();
    } catch (err) {
      console.error('Error verificando permiso:', err);
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }
  };
}

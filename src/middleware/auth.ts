import jwt from 'jsonwebtoken';
import { prisma } from '../db/prismaClient.js';

const JWT_SECRET = process.env.JWT_SECRET || 'sagrih-jwt-secret-key-2026';

export function generateToken(user: any) {
  return jwt.sign(
    {
      id: user.usuar_id,
      nombre: user.usuar_nm,
      apellido: user.usuar_ap,
      email: user.usuar_em,
      rolId: user.roles_id,
      rolNombre: user.tm_roles?.roles_nm,
    },
    JWT_SECRET,
    { expiresIn: '24h' } as jwt.SignOptions
  );
}

export function authMiddleware(req: any, res: any, next: any) {
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

export function requirePermission(permisoNm: string) {
  return async (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
    try {
      const existePermiso = await prisma.tt_rolpe.findFirst({
        where: {
          roles_id: req.user.rolId,
          tm_permi: {
            permi_nm: permisoNm
          }
        }
      });
      if (!existePermiso) {
        return res.status(403).json({ error: `Permiso requerido: ${permisoNm}` });
      }
      next();
    } catch (err) {
      console.error('Error verificando permiso:', err);
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }
  };
}

export function checkRole(allowedRoles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Acceso denegado. No autenticado.' });
    }
    const userRole = req.user.rolNombre;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: `Acceso denegado. Rol insuficiente (${userRole}). Se requiere: ${allowedRoles.join(' o ')}.` 
      });
    }
    next();
  };
}


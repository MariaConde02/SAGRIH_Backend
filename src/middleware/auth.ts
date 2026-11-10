/**
 * auth.ts — Seguridad: JWT, roles y permisos (Módulo 6).
 * Flujo: intercepta el JWT de `Authorization: Bearer <token>`, identifica al
 * usuario en TM_USUAR (con su rol desde TM_ROLES), valida que esté activo y
 * rechaza con HTTP 403 si su rol no tiene privilegios para la acción.
 * La sesión se mantiene en localStorage ("sagrih-token") en el frontend.
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prismaClient.js';

// Tipado de la sesión inyectada por verificarSesion/checkRole en req.user
declare global {
  namespace Express {
    interface Request {
      user: {
        id: number;
        nombre: string;
        apellido?: string | null;
        email?: string;
        rolId?: number | null;
        rolNombre: string;
        usuario?: any;
      };
    }
  }
}

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

/**
 * verificarSesion — verifica el token, carga el usuario desde TM_USUAR +
 * TM_ROLES y lo inyecta en req.user con el rol ACTUAL de la base de datos
 * (no el claim del JWT, que podría estar desactualizado si el rol cambió
 * después del login).
 */
export function verificarSesion(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }
  const token = header.split(' ')[1];
  let decodificado: any;
  try {
    decodificado = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  prisma.tm_usuar
    .findUnique({
      where: { usuar_id: decodificado.id },
      include: { tm_roles: true },
    })
    .then((usuario) => {
      if (!usuario || usuario.usuar_est !== 'activo') {
        return res.status(401).json({ error: 'Usuario inválido o inactivo.' });
      }
      const rolNm = usuario.tm_roles?.roles_nm;
      if (!rolNm) {
        return res.status(401).json({ error: 'Usuario sin rol asignado.' });
      }
      req.user = {
        id: usuario.usuar_id,
        nombre: usuario.usuar_nm,
        apellido: usuario.usuar_ap,
        email: usuario.usuar_em,
        rolId: usuario.roles_id,
        rolNombre: rolNm,
        usuario,
      };
      next();
    })
    .catch((err) => {
      console.error('Error verificando sesión:', err);
      return res.status(500).json({ error: 'Error al verificar la sesión' });
    });
}

/**
 * verificarRol — valida que el rol actual del usuario (desde TM_ROLES) esté
 * en la lista de roles permitidos. Reutiliza req.user si verificarSesion ya
 * corrió en la ruta (evita la doble consulta); si no, hace el flujo completo.
 */
export function verificarRol(rolesPermitidos: string[]) {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    if (!user) {
      // Sin sesión previa: verificar token + usuario + rol en una sola pasada
      return verificarSesion(req, res, () => {
        const u = req.user;
        if (!rolesPermitidos.includes(u?.rolNombre)) {
          return res.status(403).json({
            error: `Acceso denegado. Rol insuficiente (${u?.rolNombre}). Se requiere: ${rolesPermitidos.join(' o ')}.`,
          });
        }
        next();
      });
    }
    if (!rolesPermitidos.includes(user.rolNombre)) {
      return res.status(403).json({
        error: `Acceso denegado. Rol insuficiente (${user.rolNombre}). Se requiere: ${rolesPermitidos.join(' o ')}.`,
      });
    }
    next();
  };
}

/**
 * verificarPermiso — valida en TT_ROLPE + TM_PERMI que el ROL ACTUAL del
 * usuario (TM_ROLES → TM_USUAR) tenga el permiso indicado.
 */
export function verificarPermiso(permisoNm: string) {
  return async (req: any, res: any, next: any) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Autenticación requerida' });
    try {
      const rolesId = user.usuario?.roles_id ?? user.rolId;
      const existePermiso = await prisma.tt_rolpe.findFirst({
        where: {
          roles_id: rolesId,
          tm_permi: { permi_nm: permisoNm },
        },
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

// ─── Aliases usados por las rutas existentes ─────────────────────────────────
export function authMiddleware(req: any, res: any, next: any) {
  return verificarSesion(req, res, next);
}

export function checkRole(allowedRoles: string[]) {
  return verificarRol(allowedRoles);
}

export function requirePermission(permisoNm: string) {
  return verificarPermiso(permisoNm);
}

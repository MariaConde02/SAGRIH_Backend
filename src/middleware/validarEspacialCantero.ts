import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prismaClient.js';

// Tolerancia para comparaciones AABB (evita falsos positivos por Decimal -> Number)
const EPS = 1e-6;

/**
 * Middleware de validación espacial (AABB) para TM_CANTE.
 *
 * Reglas:
 *  - Proyecta las dimensiones según orientación:
 *      vertical   -> width = ancho, height = largo
 *      horizontal -> width = largo, height = ancho
 *  - Verifica que el rectángulo no exceda los límites físicos del invernadero (TM_INVER).
 *  - Verifica que no se superponga con otros canteros activos del mismo invernadero.
 *  - Si la geometría viene incompleta (falta ancho/largo/posXM/posYM o el invernadero),
 *    omite la validación y continúa el flujo (compatibilidad con seeds y SetupWizard).
 */
export async function validarEspacialCantero(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body ?? {};

    // ── Acepta alias de nombres (actual y nomenclatura de diccionario) ──
    const targetInverId = body.invernaderoId ?? body.inver_id ?? body.INVER_ID;
    const x = Number(body.posXM ?? body.CANTE_XM ?? body.cante_xm);
    const y = Number(body.posYM ?? body.CANTE_YM ?? body.cante_ym);
    const w = Number(body.ancho ?? body.anchoCantero);
    const h = Number(body.largo ?? body.largoCantero);
    const rawOr = String(body.orientacion ?? body.CANTE_OR ?? body.cante_or ?? 'horizontal')
      .toLowerCase()
      .trim();
    const isVertical = rawOr === 'vertical';

    // Id propio: en un upsert el cantero no debe chocar consigo mismo
    const currentId = body.id ?? body.cante_id ?? body.CANTE_ID_EDIT ?? null;

    // Geometría incompleta u omitida -> continuar flujo (Seed / SetupWizard)
    if (
      targetInverId === undefined || targetInverId === null || targetInverId === '' ||
      !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(w) || !Number.isFinite(h) ||
      w <= 0 || h <= 0
    ) {
      return next();
    }

    // ── 1. Lookup del invernadero (TM_INVER) ──
    const invernadero = await prisma.tm_inver.findUnique({
      where: { inver_id: String(targetInverId) }
    });

    if (!invernadero) {
      return res.status(404).json({ error: 'Invernadero no encontrado' });
    }

    const inverAncho = invernadero.inver_an != null ? Number(invernadero.inver_an) : null;
    const inverLargo = invernadero.inver_la != null ? Number(invernadero.inver_la) : null;

    // ── 2. Proyección AABB según orientación ──
    const width = isVertical ? w : h;
    const height = isVertical ? h : w;

    // ── 3. Validación de límites perimetrales ──
    if (x < 0 || y < 0) {
      return res.status(400).json({
        error: 'El cantero excede las dimensiones físicas del invernadero. Ajuste las coordenadas u orientación.'
      });
    }

    if (inverAncho !== null && inverLargo !== null) {
      if (x + width > inverAncho + EPS || y + height > inverLargo + EPS) {
        return res.status(400).json({
          error: 'El cantero excede las dimensiones físicas del invernadero. Ajuste las coordenadas u orientación.'
        });
      }
    }

    // ── 4. Validación de colisiones contra otros canteros (AABB) ──
    const canterosExistentes = await prisma.tm_cante.findMany({
      where: {
        inver_id: String(targetInverId),
        deletedAt: null,
        cante_est: { not: false },
        ...(currentId ? { cante_id: { not: String(currentId) } } : {})
      }
    });

    for (const c of canterosExistentes) {
      // Sin geometría registrada no es posible evaluar la colisión
      if (c.cante_an == null || c.cante_la == null || c.pos_xm == null || c.pos_ym == null) continue;

      const cAn = Number(c.cante_an);
      const cLa = Number(c.cante_la);
      const cx = Number(c.pos_xm);
      const cy = Number(c.pos_ym);
      if (!Number.isFinite(cAn) || !Number.isFinite(cLa) || !Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      if (cAn <= 0 || cLa <= 0) continue;

      const cIsVertical = String(c.orienta ?? 'horizontal').toLowerCase().trim() === 'vertical';
      const cWidth = cIsVertical ? cAn : cLa;
      const cHeight = cIsVertical ? cLa : cAn;

      const haySobreposicion =
        x < cx + cWidth - EPS &&
        x + width > cx + EPS &&
        y < cy + cHeight - EPS &&
        y + height > cy + EPS;

      if (haySobreposicion) {
        return res.status(400).json({
          error: 'La ubicación ingresada provoca que el cantero se sobreponga con otro existente.'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Error en middleware espacial:', error);
    return res.status(500).json({ error: 'Error interno al validar la geometría espacial.' });
  }
}

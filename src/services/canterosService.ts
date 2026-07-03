import { prisma } from '../db/prismaClient.js';

export class CanterosService {
  static async getCanteros() {
    const canteros = await prisma.tm_cante.findMany({
      where: { deletedAt: null },
      include: {
        tm_culti: { include: { tm_categ: true } },
        tt_dispo: {
          include: {
            tm_tipod: true,
            tt_lectu: { orderBy: { lectu_fh: 'desc' }, take: 1 }
          }
        },
        th_rihri: {
          where: { rihri_ff: { gt: new Date() } },
          orderBy: { rihri_fi: 'desc' },
          take: 1
        }
      },
      orderBy: { cante_id: 'asc' }
    });

    return canteros.map(r => ({
      id: r.cante_id,
      nombre: r.cante_nm,
      cultivo: r.tm_culti?.culti_nm,
      cultivoId: r.culti_id,
      umbralMin: r.cante_mi != null ? Number(r.cante_mi) : (r.tm_culti?.culti_mi != null ? Number(r.tm_culti.culti_mi) : null),
      umbralMax: r.cante_ma != null ? Number(r.cante_ma) : (r.tm_culti?.culti_ma != null ? Number(r.tm_culti.culti_ma) : null),
      overrideMin: r.cante_mi != null ? Number(r.cante_mi) : null,
      overrideMax: r.cante_ma != null ? Number(r.cante_ma) : null,
      invernaderoId: r.inver_id,
      estado: r.cante_est === false ? 'Inactivo' : 'Activo',
      ancho: r.cante_an ? Number(r.cante_an) : null,
      largo: r.cante_la ? Number(r.cante_la) : null,
      posXM: r.pos_xm ? Number(r.pos_xm) : null,
      posYM: r.pos_ym ? Number(r.pos_ym) : null,
      orientacion: r.orienta || 'horizontal',
      fechaSiembra: r.cante_fs ? r.cante_fs.toISOString().split('T')[0] : null,
      categoria: r.tm_culti?.tm_categ?.categ_nm || null,
      categId: r.tm_culti?.culti_cg || null,
      tiempoCosecha: r.tm_culti?.culti_tc || 80,
      dispositivos: r.tt_dispo.map((d: any) => ({
        id: d.dispo_id,
        tag: d.dispo_tg,
        tipoId: d.tipod_id,
        estado: d.dispo_et
      })),
      humedadActual: (() => {
        const sensoresHum = r.tt_dispo.filter((d: any) => d.tm_tipod?.tipod_nm?.toLowerCase().includes('humedad'));
        let sum = 0, count = 0;
        for (const s of sensoresHum) {
          const valStr = s.tt_lectu?.[0]?.lectu_vl;
          if (valStr != null) {
            const val = Number(valStr);
            if (!isNaN(val) && val > 0 && val <= 100) {
              sum += val;
              count++;
            }
          }
        }
        return count > 0 ? Math.round((sum / count) * 100) / 100 : null;
      })(),
      lastUpdate: (() => {
        const sensoresHum = r.tt_dispo.filter((d: any) => d.tm_tipod?.tipod_nm?.toLowerCase().includes('humedad'));
        let latest = null;
        for (const s of sensoresHum) {
          const dt = s.tt_lectu?.[0]?.lectu_fh;
          if (dt) {
            if (!latest || dt > latest) latest = dt;
          }
        }
        return latest ? latest.toISOString() : null;
      })(),
      valvula: (() => {
        const v = r.tt_dispo.find((d: any) => d.tm_tipod?.tipod_nm?.toLowerCase().includes('válvula'));
        return v ? (v.dispo_et === 'Abierta' ? 'abierta' : 'cerrada') : 'cerrada';
      })(),
      riegoFin: r.th_rihri?.[0]?.rihri_ff ? r.th_rihri[0].rihri_ff.toISOString() : null
    }));
  }

  static async getCultivos() {
    const cultivos = await prisma.tm_culti.findMany({
      select: { culti_id: true, culti_cg: true, culti_nm: true, culti_mi: true, culti_ma: true, culti_tc: true },
      orderBy: { culti_nm: 'asc' }
    });
    return cultivos.map(r => ({ 
      id: r.culti_id, 
      categId: r.culti_cg,
      nombre: r.culti_nm, 
      umbralMin: r.culti_mi, 
      umbralMax: r.culti_ma, 
      tiempoCosecha: r.culti_tc 
    }));
  }

  static async upsertCantero(data: any, userId: number | null) {
    const parsedCultiId = data.cultivoId ? parseInt(String(data.cultivoId), 10) : null;

    const result = await prisma.tm_cante.upsert({
      where: { cante_id: data.id },
      update: {
        cante_nm: data.nombre,
        inver_id: data.invernaderoId || 'INV-MAESTRO',
        culti_id: parsedCultiId,
        cante_an: data.ancho !== undefined ? data.ancho : null,
        cante_la: data.largo !== undefined ? data.largo : null,
        pos_xm: data.posXM !== undefined ? data.posXM : null,
        pos_ym: data.posYM !== undefined ? data.posYM : null,
        orienta: data.orientacion || 'horizontal'
      },
      create: {
        cante_id: data.id,
        cante_nm: data.nombre,
        inver_id: data.invernaderoId || 'INV-MAESTRO',
        culti_id: parsedCultiId,
        cante_an: data.ancho !== undefined ? data.ancho : null,
        cante_la: data.largo !== undefined ? data.largo : null,
        pos_xm: data.posXM !== undefined ? data.posXM : null,
        pos_ym: data.posYM !== undefined ? data.posYM : null,
        orienta: data.orientacion || 'horizontal'
      }
    });

    await prisma.th_audit.create({
      data: {
        usuar_id: userId,
        audit_ac: 'Creación/Edición de Cantero',
        audit_ds: `Cantero ${data.id} (${data.nombre}) registrado/actualizado`
      }
    });

    return result;
  }

  static async updateCantero(id: string, data: any, userId: number | null) {
    const oldCantero = await prisma.tm_cante.findUnique({
      where: { cante_id: id },
      select: { culti_id: true }
    });

    await prisma.tm_cante.update({
      where: { cante_id: id },
      data: {
        cante_nm: data.nombre !== undefined ? data.nombre : undefined,
        culti_id: data.cultivoId !== undefined ? (data.cultivoId === null || data.cultivoId === "" ? null : parseInt(String(data.cultivoId), 10)) : undefined,
        cante_mi: data.umbralMin !== undefined ? data.umbralMin : undefined,
        cante_ma: data.umbralMax !== undefined ? data.umbralMax : undefined,
        inver_id: data.invernaderoId !== undefined ? data.invernaderoId : undefined,
        cante_fs: data.fechaSiembra !== undefined ? (data.fechaSiembra ? new Date(data.fechaSiembra) : null) : undefined
      }
    });

    const check = await prisma.tm_cante.findUnique({
      where: { cante_id: id },
      select: { culti_id: true }
    });
    
    if (check && (check.culti_id === null)) {
      await prisma.tt_progr.deleteMany({
        where: { cante_id: id }
      });
    }

    if (oldCantero && String(oldCantero.culti_id) !== String(check?.culti_id)) {
      await prisma.th_audit.create({
        data: {
          usuar_id: userId,
          audit_ac: 'Cambio de Cultivo',
          audit_ds: `Cultivo modificado en Cantero ${id} (de ID: ${oldCantero.culti_id} a ID: ${check?.culti_id})`
        }
      });
    }
  }

  static async deleteCantero(id: string) {
    const activePrograms = await prisma.tt_progr.count({
      where: { cante_id: id, progr_at: true }
    });
    
    if (activePrograms > 0) {
      throw new Error('Operación denegada. El cantero tiene programas de riego activos. Deténgalos primero.');
    }

    await prisma.tm_cante.update({
      where: { cante_id: id },
      data: { deletedAt: new Date() }
    });
  }
}

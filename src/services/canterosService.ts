import { prisma } from '../db/prismaClient.js';
import { RiegoService } from './riegoService.js';

export class CanterosService {
  static async getCanteros() {
    // Sincronizar automáticamente el estado de válvulas cuyos riegos ya concluyeron
    await RiegoService.sincronizarValvulasVencidas();

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
          where: {
            OR: [
              { rihri_ff: null },
              { rihri_ff: { gt: new Date() } }
            ]
          },
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
        const v = r.tt_dispo.find((d: any) =>
          d.tipod_id === 4 ||
          d.tm_tipod?.tipod_nm?.toLowerCase().includes('valv') ||
          d.tm_tipod?.tipod_nm?.toLowerCase().includes('válv')
        );
        const hayRiegoActivo = Boolean(r.th_rihri && r.th_rihri.length > 0);
        const estaAbiertaDb = v?.dispo_et?.toLowerCase() === 'abierta';
        return (estaAbiertaDb || hayRiegoActivo) ? 'abierta' : 'cerrada';
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

  static async getCanteroDashboard(canteroId: string) {
    const cantero = await prisma.tm_cante.findFirst({
      where: { cante_id: canteroId, deletedAt: null },
      include: {
        tm_culti: true,
        tt_dispo: {
          include: {
            tm_tipod: true,
            tt_lectu: { orderBy: { lectu_fh: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!cantero) {
      throw new Error('Cantero no encontrado');
    }

    // 1. Detección de cultivo y sensores asignados
    const tieneCultivo = !!cantero.culti_id && !!cantero.tm_culti;
    const sensoresHum = cantero.tt_dispo.filter((d: any) =>
      d.tm_tipod?.tipod_nm?.toLowerCase().includes('humedad')
    );
    const tieneSensores = sensoresHum.length > 0;

    let motivoSinMetricas: string | null = null;
    if (!tieneCultivo && !tieneSensores) {
      motivoSinMetricas = 'Este cantero no tiene un cultivo asignado ni sensores de humedad vinculados. Para visualizar métricas y decisiones de riego, configure un cultivo e instale sensores en el módulo de Infraestructura.';
    } else if (!tieneCultivo) {
      motivoSinMetricas = 'Este cantero no tiene un cultivo asignado. Es necesario vincular un cultivo para definir los umbrales agronómicos y habilitar las métricas de monitoreo.';
    } else if (!tieneSensores) {
      motivoSinMetricas = 'Este cantero no cuenta con sensores de humedad de sustrato vinculados. Asigne sensores en el módulo de Infraestructura para registrar lecturas de humedad en tiempo real.';
    }

    // Umbrales del cultivo actual
    const umbralMin = tieneCultivo
      ? (cantero.cante_mi != null
          ? Number(cantero.cante_mi)
          : cantero.tm_culti?.culti_mi != null
          ? Number(cantero.tm_culti.culti_mi)
          : 35)
      : null;

    const umbralMax = tieneCultivo
      ? (cantero.cante_ma != null
          ? Number(cantero.cante_ma)
          : cantero.tm_culti?.culti_ma != null
          ? Number(cantero.tm_culti.culti_ma)
          : 75)
      : null;

    // Calcular humedad actual únicamente si existen sensores
    let humedadActual: number | null = null;
    if (tieneSensores) {
      let sum = 0, count = 0;
      for (const s of sensoresHum) {
        const valStr = s.tt_lectu?.[0]?.lectu_vl;
        if (valStr != null) {
          const val = Number(valStr);
          if (!isNaN(val) && val >= 0 && val <= 100) {
            sum += val;
            count++;
          }
        }
      }
      humedadActual = count > 0 ? Math.round((sum / count) * 10) / 10 : null;

      if (humedadActual === null) {
        const ultimoSuelo = await prisma.th_suelo.findFirst({
          where: { cante_id: canteroId },
          orderBy: { suelo_fe: 'desc' },
        });
        if (ultimoSuelo?.suelo_hu != null) {
          humedadActual = Math.round(Number(ultimoSuelo.suelo_hu) * 10) / 10;
        }
      }
    }

    // 2. Rango de tiempo para eventos de hoy
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyFin = new Date();
    hoyFin.setHours(23, 59, 59, 999);

    // Consulta TH_RIHRI para hoy
    const riegosHoy = await prisma.th_rihri.findMany({
      where: {
        cante_id: canteroId,
        rihri_fi: { gte: hoyInicio, lte: hoyFin },
      },
      include: {
        tt_progr: true,
      },
      orderBy: { rihri_fi: 'desc' },
    });

    // Consulta TT_PROGR cancelados / omitidos o inactivos
    const programasCancelados = await prisma.tt_progr.findMany({
      where: {
        cante_id: canteroId,
        OR: [
          { progr_at: false },
          { deletedAt: { gte: hoyInicio, lte: hoyFin } },
        ],
      },
      orderBy: { progr_fc: 'desc' },
    });

    // Consulta TH_AUDIT para cancelaciones/omisiones hoy
    const auditsHoy = await prisma.th_audit.findMany({
      where: {
        audit_fe: { gte: hoyInicio, lte: hoyFin },
        OR: [
          { audit_ac: { contains: 'cancelad', mode: 'insensitive' } },
          { audit_ac: { contains: 'omitid', mode: 'insensitive' } },
          { audit_ds: { contains: canteroId, mode: 'insensitive' } },
          { audit_ds: { contains: cantero.cante_nm, mode: 'insensitive' } },
        ],
      },
      orderBy: { audit_fe: 'desc' },
    });

    const formatearHora = (d: Date | null) => {
      if (!d) return '--:--';
      const fecha = new Date(d);
      return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    type TimelineItem = {
      fecha: Date;
      hora: string;
      tipo: 'exitoso' | 'cancelado' | 'emergencia';
      titulo: string;
      detalle: string;
    };

    const timelineItems: TimelineItem[] = [];
    const dispoIds = cantero.tt_dispo.map((d: any) => d.dispo_id);

    // Procesar riegos ejecutados, omitidos y de emergencia
    for (const r of riegosHoy) {
      const fechaItem = r.rihri_fi ? new Date(r.rihri_fi) : new Date();
      const ta = (r.rihri_ta || '').toLowerCase();

      if (ta.includes('emergencia')) {
        // Buscar el motivo agronómico registrado alrededor del evento (ventana de 10 min)
        const ventanaInicio = new Date(fechaItem.getTime() - 10 * 60 * 1000);
        const ventanaFin = new Date(fechaItem.getTime() + 10 * 60 * 1000);

        const alertaCausa = await prisma.tt_alert.findFirst({
          where: {
            alert_fd: { gte: ventanaInicio, lte: ventanaFin },
            OR: [
              ...(dispoIds.length > 0 ? [{ dispo_id: { in: dispoIds } }] : []),
              { alert_ti: { contains: canteroId, mode: 'insensitive' } },
              { alert_ti: { contains: cantero.cante_nm, mode: 'insensitive' } },
            ],
          },
          orderBy: { alert_fd: 'desc' },
        });

        let detalleMotivo = "";
        if (alertaCausa?.alert_ti) {
          detalleMotivo = `${alertaCausa.alert_ti}. Activación inmediata de riego de salvaguarda para prevenir marchitamiento y daño radicular.${r.rihri_vl ? ` Se aplicaron ${Number(r.rihri_vl)} L de agua.` : ''}`;
        } else {
          detalleMotivo = `Humedad en nivel crítico inferior al umbral mínimo (${humedadActual != null ? `${humedadActual}%` : '< 30%'}). Se activó el riego de emergencia para mitigar estrés hídrico severo.${r.rihri_vl ? ` Se aplicaron ${Number(r.rihri_vl)} L.` : ''}`;
        }

        timelineItems.push({
          fecha: fechaItem,
          hora: formatearHora(fechaItem),
          tipo: 'emergencia',
          titulo: 'Riego de Emergencia',
          detalle: detalleMotivo,
        });
      } else if (ta.includes('cancelad') || ta.includes('omitid')) {
        timelineItems.push({
          fecha: fechaItem,
          hora: formatearHora(fechaItem),
          tipo: 'cancelado',
          titulo: 'Riego Programado Omitido',
          detalle: `Humedad de sustrato en ${Math.round(humedadActual)}% (adecuada dentro o sobre el rango). Se omitió el ciclo para prevenir saturación y asfixia radicular.`,
        });
      } else {
        const esManual = r.rihri_ta === 'Manual';
        const motivo = esManual
          ? `Riego manual iniciado directamente por el operador desde el panel de control.${r.rihri_vl ? ` Se suministraron ${Number(r.rihri_vl)} Litros.` : ' Ciclo finalizado exitosamente.'}`
          : `Riego programado completado. La humedad del suelo requería hidratación conforme al calendario establecido.${r.rihri_vl ? ` Se aplicaron ${Number(r.rihri_vl)} Litros.` : ''}`;

        timelineItems.push({
          fecha: fechaItem,
          hora: formatearHora(fechaItem),
          tipo: 'exitoso',
          titulo: esManual ? 'Riego Manual Ejecutado' : 'Riego Programado Ejecutado',
          detalle: motivo,
        });
      }
    }

    // Procesar programas cancelados / omitidos por umbral
    for (const p of programasCancelados) {
      let fechaProg = p.progr_fc ? new Date(p.progr_fc) : new Date();
      if (p.progr_hi) {
        const hDate = new Date(p.progr_hi);
        const hoyProg = new Date();
        hoyProg.setHours(hDate.getUTCHours(), hDate.getUTCMinutes(), 0, 0);
        fechaProg = hoyProg;
      }

      timelineItems.push({
        fecha: fechaProg,
        hora: formatearHora(fechaProg),
        tipo: 'cancelado',
        titulo: 'Riego Programado Omitido',
        detalle: `Humedad de sustrato en ${Math.round(humedadActual)}% (por encima del umbral de activación). Se omitió el riego para salvaguardar el cultivo y evitar sobrerriego.`,
      });
    }

    // Procesar audits de omisiones agronómicas
    for (const aud of auditsHoy) {
      const fechaItem = aud.audit_fe ? new Date(aud.audit_fe) : new Date();
      timelineItems.push({
        fecha: fechaItem,
        hora: formatearHora(fechaItem),
        tipo: 'cancelado',
        titulo: 'Riego Programado Omitido',
        detalle: aud.audit_ds || `Humedad de sustrato en ${Math.round(humedadActual)}%. Ciclo omitido preventivamente para evitar anoxia radicular.`,
      });
    }

    // Ordenar timeline descendentemente (más reciente primero)
    timelineItems.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    const timeline = (tieneCultivo && tieneSensores)
      ? timelineItems.map((item) => ({
          hora: item.hora,
          tipo: item.tipo,
          titulo: item.titulo,
          detalle: item.detalle,
        }))
      : [];

    const contadores = (tieneCultivo && tieneSensores)
      ? {
          exitosos: timelineItems.filter((i) => i.tipo === 'exitoso').length,
          cancelados: timelineItems.filter((i) => i.tipo === 'cancelado').length,
          emergencias: timelineItems.filter((i) => i.tipo === 'emergencia').length,
        }
      : null;

    return {
      identidad: {
        id: cantero.cante_id,
        nombre: cantero.cante_nm,
        cultivo: cantero.tm_culti?.culti_nm || null,
        tieneCultivo,
        tieneSensores,
        motivoSinMetricas,
        humedadActual: humedadActual !== null ? Math.round(humedadActual) : null,
        umbralMin: umbralMin !== null ? Math.round(umbralMin) : null,
        umbralMax: umbralMax !== null ? Math.round(umbralMax) : null,
      },
      contadores,
      timeline,
    };
  }
}

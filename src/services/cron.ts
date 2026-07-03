import { prisma } from '../db/prismaClient.js';

export const startCronJobs = () => {
  // Función que procesa los mantenimientos programados
  const processScheduledMaintenance = async () => {
    try {
      const now = new Date();
      const pendingSchedules = await prisma.tt_manpr.findMany({
        where: {
          manpr_st: true,
          manpr_nx: {
            lte: now
          }
        }
      });

      for (const schedule of pendingSchedules) {
        // 1. Crear el registro en el historial de mantenimiento (th_mante)
        await prisma.th_mante.create({
          data: {
            mante_ta: schedule.manpr_ta,
            usuar_id: schedule.usuar_id,
            dispo_id: schedule.dispo_id,
            mante_ob: schedule.manpr_ob,
            mante_fe: now,
            mante_re: false
          }
        });

        // 2. Calcular la próxima fecha
        const nextDate = new Date(schedule.manpr_nx);
        if (schedule.manpr_rp === 'semanal') {
          nextDate.setDate(nextDate.getDate() + 7);
        } else if (schedule.manpr_rp === 'mensual') {
          nextDate.setMonth(nextDate.getMonth() + 1);
        } else {
          // Si es "unica", desactivamos el schedule
          await prisma.tt_manpr.update({
            where: { manpr_id: schedule.manpr_id },
            data: { manpr_st: false }
          });
          continue;
        }

        // 3. Actualizar la fecha del próximo mantenimiento
        await prisma.tt_manpr.update({
          where: { manpr_id: schedule.manpr_id },
          data: { manpr_nx: nextDate }
        });
        
        console.log(`Mantenimiento recurrente generado: ${schedule.manpr_ta}`);
      }
    } catch (error) {
      console.error('Error procesando mantenimientos programados (Cron):', error);
    }
  };

  // Ejecutar Inmediatamente al iniciar el servidor
  processScheduledMaintenance();

  // Y luego cada hora (3600000 ms) para estar seguros
  setInterval(processScheduledMaintenance, 3600 * 1000);
  console.log("Motor cron de mantenimientos inicializado.");
};

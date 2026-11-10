import nodemailer from 'nodemailer';

/**
 * email.service.ts — Servicio de despacho de correos electrónicos vía Nodemailer (Módulo 5: Cierre Diario)
 */

interface DatosCierreDiario {
  fecha: string;
  invernaderoNombre: string;
  consumoTotalLts: number;
  totalRiegos: number;
  totalAlertas: number;
  temperaturaPromedio: number | null;
  humedadPromedio: number | null;
  riegosPorCantero?: { cantero: string; litros: number; cultivo?: string }[];
  alertasDestacadas?: { hora: string; cantero: string; tipo: string; detalle: string }[];
}

/**
 * Crea y configura el transportador de Nodemailer con variables de entorno o fallback seguro
 */
function obtenerTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false, // Evita problemas de certificados en redes educativas o VPS
      },
    });
  }

  return null;
}

/**
 * Envía un correo electrónico en formato HTML a uno o varios destinatarios
 */
export async function enviarCorreoHTML(
  destinatarios: string | string[],
  asunto: string,
  cuerpoHtml: string
): Promise<boolean> {
  const listaDestinatarios = Array.isArray(destinatarios)
    ? destinatarios.filter(Boolean)
    : [destinatarios].filter(Boolean);

  if (listaDestinatarios.length === 0) {
    console.warn('[EMAIL·SMTP] Lista de destinatarios vacía. No se envía el correo.');
    return false;
  }

  const fromAddress =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    `"SAGRIH - Inteligencia Hídrica" <${process.env.SMTP_USER || 'soporte.sagrih@gmail.com'}>`;

  const transporter = obtenerTransporter();

  if (!transporter) {
    console.warn(
      '[EMAIL·SMTP] ⚠️ No se detectaron credenciales SMTP (SMTP_USER / SMTP_PASS) en el archivo .env.'
    );
    console.log(`[EMAIL·MOCK] 📨 Simulación de envío exitoso:`);
    console.log(`[EMAIL·MOCK] Para: ${listaDestinatarios.join(', ')}`);
    console.log(`[EMAIL·MOCK] Asunto: ${asunto}`);
    console.log(`[EMAIL·MOCK] Longitud HTML: ${cuerpoHtml.length} caracteres.`);
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: listaDestinatarios.join(', '),
      subject: asunto,
      html: cuerpoHtml,
    });

    console.log(`[EMAIL·SMTP] ✔ Correo enviado exitosamente: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error('[EMAIL·SMTP] ✗ Error al enviar correo electrónico:', error?.message || error);
    return false;
  }
}

/**
 * Construye una plantilla HTML responsive, ejecutiva y elegante para el Cierre Diario
 */
export function generarPlantillaCierreDiario(datos: DatosCierreDiario): string {
  const frontendUrl = process.env.FRONTEND_URL || 'https://sagrih-frontend.vercel.app';
  const enlaceDescarga = `${frontendUrl}/historial`;

  const tempTexto = datos.temperaturaPromedio != null ? `${datos.temperaturaPromedio} °C` : '—';
  const humTexto = datos.humedadPromedio != null ? `${datos.humedadPromedio} %` : '—';

  // Filas de canteros
  const filasCanteros = (datos.riegosPorCantero || [])
    .map(
      (c) => `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 14px; font-size: 13px; color: #1E293B; font-weight: 600;">${c.cantero}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #64748B;">${c.cultivo || 'Sin cultivo'}</td>
          <td style="padding: 10px 14px; font-size: 13px; color: #166534; font-weight: 700; text-align: right;">${Number(c.litros || 0).toLocaleString()} L</td>
        </tr>
      `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SAGRIH - Cierre Diario de Operaciones</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 25px 10px;">
    <tr>
      <td align="center">
        <!-- Contenedor Principal -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 640px; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); border: 1px solid #E2E8F0;">
          
          <!-- Encabezado Institucional -->
          <tr>
            <td style="background: linear-gradient(135deg, #14532D 0%, #166534 50%, #15803D 100%); padding: 30px 24px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #86EFAC; text-transform: uppercase; letter-spacing: 1.5px;">República Bolivariana de Venezuela · UNEFA Táchira</p>
              <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.5px;">SAGRIH</h1>
              <p style="margin: 0; font-size: 13px; color: #DCFCE7; font-weight: 500;">Sistema Automatizado de Gestión de Riego e Inteligencia Hídrica</p>
              <div style="display: inline-block; margin-top: 14px; padding: 5px 14px; background-color: rgba(255, 255, 255, 0.15); border-radius: 20px; font-size: 12px; color: #FFFFFF; font-weight: 600;">
                📊 Reporte Oficial de Cierre Diario · ${datos.fecha}
              </div>
            </td>
          </tr>

          <!-- Resumen de Ficha -->
          <tr>
            <td style="padding: 24px 28px 10px 28px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size: 13px; color: #64748B;">
                    <strong>Invernadero:</strong> <span style="color: #0F172A; font-weight: 600;">${datos.invernaderoNombre}</span>
                  </td>
                  <td style="font-size: 13px; color: #64748B; text-align: right;">
                    <strong>Estado de Cierre:</strong> <span style="color: #166534; font-weight: 700;">Consolidado ✔</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tarjetas de Métricas Clave -->
          <tr>
            <td style="padding: 10px 28px 24px 28px;">
              <table width="100%" border="0" cellspacing="8" cellpadding="0">
                <tr>
                  <!-- Consumo Total -->
                  <td width="50%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 16px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Consumo Total</div>
                    <div style="font-size: 22px; font-weight: 800; color: #14532D; margin: 4px 0 2px 0;">${Number(datos.consumoTotalLts || 0).toLocaleString()} <span style="font-size: 14px; font-weight: 600;">L</span></div>
                    <div style="font-size: 11px; color: #15803D;">Volumen hídrico aplicado hoy</div>
                  </td>
                  <!-- Riegos Ejecutados -->
                  <td width="50%" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 16px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #1D4ED8; text-transform: uppercase; letter-spacing: 0.5px;">Riegos Realizados</div>
                    <div style="font-size: 22px; font-weight: 800; color: #1E40AF; margin: 4px 0 2px 0;">${datos.totalRiegos} <span style="font-size: 14px; font-weight: 600;">eventos</span></div>
                    <div style="font-size: 11px; color: #2563EB;">Automáticos y manuales</div>
                  </td>
                </tr>
                <tr>
                  <!-- Clima Promedio -->
                  <td width="50%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 16px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #B45309; text-transform: uppercase; letter-spacing: 0.5px;">Clima Promedio</div>
                    <div style="font-size: 20px; font-weight: 800; color: #92400E; margin: 4px 0 2px 0;">${tempTexto} <span style="font-size: 13px; font-weight: 400; color: #D97706;">|</span> ${humTexto}</div>
                    <div style="font-size: 11px; color: #B45309;">Temperatura y Humedad Rel.</div>
                  </td>
                  <!-- Alertas Críticas -->
                  <td width="50%" style="background-color: ${datos.totalAlertas > 0 ? '#FEF2F2' : '#F8FAFC'}; border: 1px solid ${datos.totalAlertas > 0 ? '#FECACA' : '#E2E8F0'}; border-radius: 10px; padding: 16px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: ${datos.totalAlertas > 0 ? '#B91C1C' : '#475569'}; text-transform: uppercase; letter-spacing: 0.5px;">Alertas Críticas</div>
                    <div style="font-size: 22px; font-weight: 800; color: ${datos.totalAlertas > 0 ? '#991B1B' : '#334155'}; margin: 4px 0 2px 0;">${datos.totalAlertas} <span style="font-size: 14px; font-weight: 600;">incidencias</span></div>
                    <div style="font-size: 11px; color: ${datos.totalAlertas > 0 ? '#DC2626' : '#64748B'};">${datos.totalAlertas === 0 ? 'Operación 100% estable' : 'Requieren atención técnica'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            filasCanteros
              ? `
          <!-- Tabla de Canteros -->
          <tr>
            <td style="padding: 0 28px 24px 28px;">
              <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">
                Distribución Hídrica por Sector
              </h3>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                    <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-align: left;">Cantero</th>
                    <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-align: left;">Cultivo</th>
                    <th style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-align: right;">Consumo</th>
                  </tr>
                </thead>
                <tbody>
                  ${filasCanteros}
                </tbody>
              </table>
            </td>
          </tr>
          `
              : ''
          }

          <!-- Llamado a la Acción y Descarga PDF -->
          <tr>
            <td style="padding: 10px 28px 30px 28px; text-align: center;">
              <div style="background-color: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 10px; padding: 20px 18px; margin-bottom: 22px;">
                <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #1E293B;">
                  📄 ¿Desea el Reporte Oficial en PDF con gráficas analíticas?
                </p>
                <p style="margin: 0; font-size: 12px; color: #64748B; line-height: 1.5;">
                  Por políticas de rendimiento y optimización en servidores cloud, el reporte PDF institucional con gráficas vectoriales y bitácora completa se genera bajo demanda directamente en la plataforma.
                </p>
              </div>

              <!-- Botón CTA -->
              <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #166534 0%, #15803D 100%);">
                    <a href="${enlaceDescarga}" target="_blank" style="font-size: 14px; font-weight: 700; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 8px; display: inline-block;">
                      Ingresar a SAGRIH y Descargar PDF Oficial &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pie de Página Institucional -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 24px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 11px; color: #64748B; font-weight: 600;">
                Sistema Automatizado de Gestión de Riego e Inteligencia Hídrica · SAGRIH
              </p>
              <p style="margin: 0; font-size: 10px; color: #94A3B8;">
                Este es un reporte automático generado a las 23:59 (VET). Por favor no responda a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

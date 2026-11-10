/**
 * telegramService.ts — Servicio bidireccional de Telegram para SAGRIH.
 *
 * ── Salida (outbound) ────────────────────────────────────────────────────────
 * Despacho de alertas críticas vía sendMessage (fire-and-forget). Las llamadas
 * no bloquean el hilo principal aunque Telegram o la red fallen.
 * Las alertas críticas incluyen un botón Inline Keyboard para resolverlas
 * directamente desde el chat sin necesidad de abrir la plataforma web.
 *
 * ── Entrada (inbound · Long Polling) ────────────────────────────────────────
 * Ciclo de escucha basado en getUpdates (sin librerías externas, solo fetch).
 * Maneja dos tipos de update:
 *  · message       → Comando /start: responde con el Chat ID (Módulo 6 Onboarding).
 *  · callback_query → Botón "Marcar como Resuelta": actualiza TT_ALERT en BD.
 *
 * Observabilidad (Proceso 6.0):
 *  - [TELEGRAM·ENV]     — Estado del token al arrancar / en cada despacho.
 *  - [TELEGRAM·DB]      — Consultas a TM_USUAR (USUAR_TI) y TT_ALERT.
 *  - [TELEGRAM·HTTP]    — Respuesta real de la API de Telegram por Chat ID.
 *  - [TELEGRAM·NET]     — Fallos de red antes de llegar a Telegram.
 *  - [TELEGRAM·POLLING] — Ciclo de escucha (updates, callbacks, errores).
 */
import { prisma } from '../db/prismaClient.js';

// Roles que reciben notificación push de alertas críticas (Proceso 6.0)
const ROLES_DESTINO = ['Administrador', 'Ingeniero', 'Supervisor'];

let avisoSinToken = false;

// ─── Helpers de observabilidad ───────────────────────────────────────────────

/** Devuelve el token limpio (sin espacios accidentales) o undefined. */
function resolverToken(): string | undefined {
  const raw = process.env.TELEGRAM_BOT_TOKEN;
  if (!raw) return undefined;
  const token = raw.trim();
  return token.length > 0 ? token : undefined;
}

/** Log de diagnóstico del entorno — se emite una sola vez al arrancar. */
export function diagnosticarEntornoTelegram(): void {
  const raw = process.env.TELEGRAM_BOT_TOKEN;
  if (!raw) {
    console.warn('[TELEGRAM·ENV] TELEGRAM_BOT_TOKEN ausente en process.env. El despacho de alertas críticas estará desactivado.');
    return;
  }
  if (raw !== raw.trim()) {
    console.warn(`[TELEGRAM·ENV] TELEGRAM_BOT_TOKEN contiene espacios sobrantes (longitud raw=${raw.length}, trimmed=${raw.trim().length}). Se aplicará trim() automáticamente.`);
  }
  const token = raw.trim();
  // Ocultamos el token completo en el log; mostramos solo el prefijo del Bot ID
  const preview = token.split(':')[0] ?? '???';
  console.log(`[TELEGRAM·ENV] Token detectado — Bot ID prefix: ${preview} (longitud total: ${token.length} chars). ✔`);
}

// ─── Envío a un único Chat ID ─────────────────────────────────────────────────

/**
 * Payload base de Telegram sendMessage; `reply_markup` es opcional y se usa
 * para adjuntar Inline Keyboards a las alertas críticas.
 */
interface SendMessagePayload {
  chat_id: string | number;
  text: string;
  parse_mode: 'HTML';
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

/**
 * Función interna que ejecuta el POST a sendMessage con cualquier payload.
 * Centraliza logs y manejo de errores HTTP/red para todos los tipos de envío.
 */
function _despacharMensaje(payload: SendMessagePayload): void {
  const botToken = resolverToken();
  const chatId = String(payload.chat_id);

  if (!botToken) {
    console.error('[TELEGRAM·ENV] Intento de envío sin token válido. Abortando despacho.');
    return;
  }
  if (!chatId.trim()) {
    console.error('[TELEGRAM·DB] Chat ID vacío en _despacharMensaje — se omite este destinatario.');
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  console.log(`[TELEGRAM·HTTP] → POST sendMessage | Chat ID: ${chatId}`);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error(
          `[TELEGRAM·HTTP] ✗ Error HTTP ${res.status} para Chat ID ${chatId}:`,
          JSON.stringify(data),
        );
      } else {
        console.log(
          `[TELEGRAM·HTTP] ✔ Mensaje entregado | Chat ID: ${chatId} | message_id: ${data?.result?.message_id ?? 'N/A'}`,
        );
      }
    })
    .catch((err) =>
      console.error(`[TELEGRAM·NET] ✗ Fallo de red para Chat ID ${chatId}:`, err?.message ?? err),
    );
}

/** Envía un mensaje de texto plano/HTML a UN chat. Fire-and-forget. */
export function enviarAlertaTelegram(chatId: string, mensaje: string): void {
  _despacharMensaje({ chat_id: chatId, text: mensaje, parse_mode: 'HTML' });
}

/**
 * Envía un mensaje de aviso/resumen a un chat de Telegram (asíncrono con confirmación).
 */
export async function enviarMensajeTelegram(chatId: string | number, mensaje: string): Promise<boolean> {
  const botToken = resolverToken();
  const cId = String(chatId).trim();

  if (!botToken) {
    console.warn('[TELEGRAM·ENV] Intento de envío de mensaje sin token válido. Omitiendo.');
    return false;
  }
  if (!cId) {
    console.warn('[TELEGRAM·DB] Chat ID vacío para enviarMensajeTelegram.');
    return false;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cId,
        text: mensaje,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`[TELEGRAM·HTTP] Error enviando mensaje a Chat ID ${cId}:`, data);
      return false;
    }
    console.log(`[TELEGRAM·HTTP] ✔ Notificación de Cierre entregada a Chat ID ${cId}`);
    return true;
  } catch (err: any) {
    console.error(`[TELEGRAM·NET] Fallo de red enviando a ${cId}:`, err?.message || err);
    return false;
  }
}

/**
 * Envía un mensaje de alerta crítica con un botón Inline Keyboard que permite
 * al operario marcar la alerta como resuelta directamente desde Telegram.
 * El `callback_data` codifica la acción y el ALERT_ID separados por `|`.
 * Fire-and-forget.
 */
export function enviarAlertaConBoton(chatId: string, mensaje: string, alertId: number): void {
  _despacharMensaje({
    chat_id: chatId,
    text: mensaje,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '✅ Marcar como Resuelta',
          callback_data: `resolver_alerta|${alertId}`,
        },
      ]],
    },
  });
}

// ─── Despacho masivo a roles críticos ────────────────────────────────────────

/**
 * Filtro estricto del botón interactivo: "✅ Marcar como Resuelta" SOLO se
 * adjunta cuando la alerta pertenece a la categoría **Mantenimiento**
 * (TM_TIPAL.TIPAL_NM). Cualquier otra categoría se envía como mensaje simple.
 * Fire-and-forget (no bloquea al llamador).
 */
async function despacharConFiltroBoton(chatIds: string[], mensaje: string, alertId?: number): Promise<void> {
  let idBoton: number | undefined;

  if (alertId !== undefined) {
    try {
      const alerta = await prisma.tt_alert.findUnique({
        where: { alert_id: alertId },
        select: { tm_tipal: { select: { tipal_nm: true } } },
      });
      const esMantenimiento = alerta?.tm_tipal?.tipal_nm === 'Mantenimiento';
      idBoton = esMantenimiento ? alertId : undefined;
      if (!esMantenimiento) {
        console.log(
          `[TELEGRAM] Botón "Marcar como Resuelta" omitido — alerta #${alertId} con categoría "${alerta?.tm_tipal?.tipal_nm ?? 'desconocida'}" (solo aplica a Mantenimiento).`,
        );
      }
    } catch (err: any) {
      console.error('[TELEGRAM·DB] Error validando categoría de alerta para el botón:', err?.message ?? err);
      idBoton = undefined;
    }
  }

  for (const chatId of chatIds) {
    if (idBoton !== undefined) {
      enviarAlertaConBoton(chatId, mensaje, idBoton);
    } else {
      enviarAlertaTelegram(chatId, mensaje);
    }
  }
}

/**
 * Despacha un evento crítico a todos los usuarios activos con rol
 * Administrador/Ingeniero/Supervisor que tengan USUAR_TI registrado.
 *
 * Cuando se proporciona `alertId` (ALERT_ID de TT_ALERT), el botón de
 * resolución SOLO se adjunta si la alerta es de categoría Mantenimiento.
 * La consulta a BD y los envíos son fire-and-forget (sin await en el llamador).
 */
export function notificarCriticos(titulo: string, cuerpoHtml: string, alertId?: number): void {
  const botToken = resolverToken();

  if (!botToken) {
    if (!avisoSinToken) {
      console.warn('[TELEGRAM·ENV] TELEGRAM_BOT_TOKEN no está configurado o está vacío — los despachos de alertas críticas se omiten.');
      avisoSinToken = true;
    }
    return;
  }

  console.log(`[TELEGRAM·DB] Consultando TM_USUAR con USUAR_TI registrado y roles: [${ROLES_DESTINO.join(', ')}]…`);

  prisma.tm_usuar
    .findMany({
      where: {
        usuar_est: 'activo',
        usuar_ti: { not: null },
        tm_roles: { roles_nm: { in: ROLES_DESTINO } },
      },
      select: { usuar_ti: true, usuar_nm: true },
    })
    .then((usuarios) => {
      console.log(`[TELEGRAM·DB] TM_USUAR devolvió ${usuarios.length} fila(s) con USUAR_TI no nulo.`);

      if (usuarios.length === 0) {
        console.warn('[TELEGRAM·DB] Ningún usuario activo con los roles destino tiene USUAR_TI registrado. Verifica la columna usuar_ti en la BD.');
        return;
      }

      // Log individual por usuario para detectar Chat IDs mal formados
      usuarios.forEach((u) => {
        const tiValor = u.usuar_ti ?? '(null)';
        console.log(`[TELEGRAM·DB]   · ${u.usuar_nm ?? 'sin nombre'} → USUAR_TI: "${tiValor}"`);
      });

      const chatIds = [
        ...new Set(usuarios.map((u) => u.usuar_ti?.trim()).filter(Boolean)),
      ] as string[];

      if (chatIds.length === 0) {
        console.warn('[TELEGRAM·DB] USUAR_TI solo contiene valores vacíos o con espacios. Se omite el despacho.');
        return;
      }

      const mensaje = `<b>🚨 SAGRIH · ${titulo}</b>\n${cuerpoHtml}`;
      console.log(`[TELEGRAM·HTTP] Despachando a ${chatIds.length} Chat ID(s) únicos…`);

      void despacharConFiltroBoton(chatIds, mensaje, alertId);
    })
    .catch((err) =>
      console.error('[TELEGRAM·DB] ✗ Error al consultar destinatarios en TM_USUAR (USUAR_TI):', err?.message ?? err),
    );
}

// ─── Despacho dirigido por roles específicos (Gestión por Excepción) ─────────

/**
 * Despacha un push inmediato únicamente a los roles indicados en `roles`.
 * Diseñado para eventos destructivos o que sacan al sistema de su autonomía
 * (ej. eliminación de TM_INVER, cambio a modo manual de actuador).
 *
 * Cuando se proporciona `alertId` el mensaje incluye el botón de resolución.
 * Fire-and-forget: no bloquea la respuesta HTTP al cliente.
 *
 * @param roles  Subset de roles a notificar (ej. ['Administrador']).
 * @param emoji  Emoji de encabezado para diferenciar la severidad visualmente.
 * @param titulo Título corto del evento.
 * @param cuerpoHtml Detalle en HTML (acepta <b>, <i>, <code>).
 * @param alertId ALERT_ID de TT_ALERT para adjuntar botón de resolución (opcional).
 */
export function notificarRolesTelegram(
  roles: string[],
  emoji: string,
  titulo: string,
  cuerpoHtml: string,
  alertId?: number,
): void {
  if (!resolverToken()) {
    if (!avisoSinToken) {
      console.warn('[TELEGRAM·ENV] TELEGRAM_BOT_TOKEN no configurado — push de evento omitido.');
      avisoSinToken = true;
    }
    return;
  }

  console.log(`[TELEGRAM·DB] Evento "${titulo}" → consultando TM_USUAR para roles: [${roles.join(', ')}]…`);

  prisma.tm_usuar
    .findMany({
      where: {
        usuar_est: 'activo',
        usuar_ti: { not: null },
        tm_roles: { roles_nm: { in: roles } },
      },
      select: { usuar_ti: true, usuar_nm: true },
    })
    .then((usuarios) => {
      const chatIds = [
        ...new Set(usuarios.map((u) => u.usuar_ti?.trim()).filter(Boolean)),
      ] as string[];

      console.log(`[TELEGRAM·DB] "${titulo}" → ${chatIds.length} Chat ID(s) destino.`);
      if (chatIds.length === 0) {
        console.warn(`[TELEGRAM·DB] Ningún usuario con roles [${roles.join(', ')}] tiene USUAR_TI registrado.`);
        return;
      }

      const mensaje = `${emoji} <b>SAGRIH · ${titulo}</b>\n${cuerpoHtml}`;
      void despacharConFiltroBoton(chatIds, mensaje, alertId);
    })
    .catch((err) =>
      console.error(`[TELEGRAM·DB] ✗ Error consultando destinatarios para "${titulo}":`, err?.message ?? err),
    );
}

// ─── Restablecimiento de Parada de Emergencia (Módulo 5 · Proceso 6.0) ───────

/**
 * Push de restablecimiento a Ingenieros y Administradores cuando el sistema
 * vuelve a MODO AUTOMÁTICO tras una parada de emergencia.
 *
 * @param nombreInvernadero Nombre del invernadero parado; `null`/vacío = sistema completo.
 * @param estopMotivo       Motivo ORIGINAL de la parada (ESTOP_MO antes de la resolución).
 * @param contexto          Opcional: quién restableció y notas de resolución.
 * Fire-and-forget: no bloquea la respuesta HTTP al cliente.
 */
export function notificarRestablecimiento(
  nombreInvernadero: string | null | undefined,
  estopMotivo: string,
  contexto?: { quien?: string; notas?: string },
): void {
  if (!resolverToken()) {
    if (!avisoSinToken) {
      console.warn('[TELEGRAM·ENV] TELEGRAM_BOT_TOKEN no configurado — push de restablecimiento omitido.');
      avisoSinToken = true;
    }
    return;
  }

  const mensajeRestablecimiento =
    `✅ <b>SISTEMA RESTABLECIDO</b>\n\n` +
    `El ${nombreInvernadero ? `invernadero ${nombreInvernadero}` : 'sistema completo'} ha retornado a MODO AUTOMÁTICO.\n\n` +
    `<b>Motivo de la parada anterior:</b>\n<i>${estopMotivo}</i>` +
    (contexto?.quien ? `\n\n<b>Restablecido por:</b> ${contexto.quien}` : '') +
    (contexto?.notas ? `\n<b>Resolución:</b> ${contexto.notas}` : '');

  console.log(`[TELEGRAM·DB] Restablecimiento (${nombreInvernadero ?? 'sistema completo'}) → consultando TM_USUAR para roles: [Administrador, Ingeniero]…`);

  prisma.tm_usuar
    .findMany({
      where: {
        usuar_est: 'activo',
        usuar_ti: { not: null },
        tm_roles: { roles_nm: { in: ['Administrador', 'Ingeniero'] } },
      },
      select: { usuar_ti: true, usuar_nm: true },
    })
    .then((usuarios) => {
      const chatIds = [
        ...new Set(usuarios.map((u) => u.usuar_ti?.trim()).filter(Boolean)),
      ] as string[];

      console.log(`[TELEGRAM·DB] Restablecimiento → ${chatIds.length} Chat ID(s) destino.`);
      if (chatIds.length === 0) {
        console.warn('[TELEGRAM·DB] Ningún Ingeniero/Administrador tiene USUAR_TI registrado.');
        return;
      }
      // Sin botón: el restablecimiento es informativo (no resuelve una alerta)
      void despacharConFiltroBoton(chatIds, mensajeRestablecimiento);
    })
    .catch((err) =>
      console.error('[TELEGRAM·DB] ✗ Error consultando destinatarios del restablecimiento:', err?.message ?? err),
    );
}

// ─── Long Polling — Escucha de mensajes entrantes (Módulo 6 · Onboarding) ────

/**
 * Cursor de posición en la cola de updates de Telegram.
 * Se incrementa tras procesar cada update para no recibirlo de nuevo.
 */
let lastUpdateId = 0;

/**
 * Intervalo de espera entre ciclos de polling cuando todo va bien (ms).
 * Con timeout=5 en getUpdates, Telegram mantiene la conexión abierta hasta
 * 5 s si no hay mensajes, por lo que el intervalo real entre ciclos vacíos
 * es ≈ 5 s sin carga adicional en el servidor.
 */
const POLLING_INTERVAL_MS = 3_000;

/**
 * Intervalo de reintento en caso de error de red o respuesta no-ok (ms).
 * Se espera más tiempo para no saturar la API en situaciones de fallo.
 */
const POLLING_RETRY_MS = 15_000;

/**
 * Procesa un único update de Telegram y responde si es necesario.
 * Maneja:
 *  - message (text=/start) → Responde con el Chat ID para Onboarding (Módulo 6).
 *  - callback_query (resolver_alerta|ID) → Marca TT_ALERT como resuelta en BD
 *    y confirma el clic con answerCallbackQuery para quitar el "reloj de carga".
 */
async function procesarUpdate(update: Record<string, any>): Promise<void> {
  // Avanzar el cursor siempre, incluso si el update no nos interesa
  if (typeof update.update_id === 'number') {
    lastUpdateId = update.update_id;
  }

  // ── Rama 1: Mensajes de texto (comandos) ────────────────────────────────────
  const msg = update.message;
  if (msg) {
    const chatId: number | undefined = msg.chat?.id;
    const texto: string | undefined = msg.text?.trim();
    const nombreUsuario: string = msg.from?.first_name ?? msg.from?.username ?? 'Usuario';

    if (!chatId || !texto) return;

    console.log(`[TELEGRAM·POLLING] ← mensaje | Update #${update.update_id} | Chat ID: ${chatId} | Texto: "${texto}"`);

    if (texto === '/start') {
      const respuesta =
        `🌿 <b>Bienvenido a SAGRIH, ${nombreUsuario}!</b>\n\n` +
        `Para recibir alertas críticas del sistema de riego e invernadero, ` +
        `necesitas registrar tu <b>Chat ID</b> en tu perfil.\n\n` +
        `Tu Chat ID personal es:\n\n` +
        `<code>${chatId}</code>\n\n` +
        `📋 <b>Pasos:</b>\n` +
        `1. Copia el número de arriba (toca y mantén presionado).\n` +
        `2. Abre la plataforma web SAGRIH.\n` +
        `3. Ve a <b>Mi Perfil → Notificaciones Telegram</b>.\n` +
        `4. Pega el número en el campo <i>Chat ID</i> y guarda.\n\n` +
        `✅ A partir de ese momento recibirás alertas directamente aquí.`;

      enviarAlertaTelegram(chatId.toString(), respuesta);
      console.log(`[TELEGRAM·POLLING] /start → Chat ID ${chatId} enviado a ${nombreUsuario}`);
    }
    return;
  }

  // ── Rama 2: Callbacks de botones Inline Keyboard ────────────────────────────
  const cb = update.callback_query;
  if (cb) {
    const callbackQueryId: string = cb.id;
    const chatId: number | undefined = cb.message?.chat?.id;
    const callbackData: string | undefined = cb.data;
    const nombreUsuario: string = cb.from?.first_name ?? cb.from?.username ?? 'Operario';

    console.log(`[TELEGRAM·POLLING] ← callback_query | Update #${update.update_id} | Chat ID: ${chatId} | data: "${callbackData}"`);

    // Siempre responder answerCallbackQuery para quitar el indicador de carga
    const botToken = resolverToken();
    if (botToken && callbackQueryId) {
      fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId }),
      }).catch((err) =>
        console.error('[TELEGRAM·NET] ✗ Error en answerCallbackQuery:', err?.message ?? err),
      );
    }

    // Procesar acción: resolver_alerta|<ALERT_ID>
    if (callbackData?.startsWith('resolver_alerta|')) {
      const partes = callbackData.split('|');
      const alertId = parseInt(partes[1] ?? '', 10);

      if (isNaN(alertId)) {
        console.error(`[TELEGRAM·POLLING] callback_data inválido (ALERT_ID no es número): "${callbackData}"`);
        return;
      }

      console.log(`[TELEGRAM·DB] Marcando TT_ALERT #${alertId} como resuelta (solicitado por ${nombreUsuario}, Chat ID ${chatId})…`);

      try {
        const resultado = await prisma.tt_alert.updateMany({
          where: { alert_id: alertId, alert_ea: 'activa' },
          data: { alert_ea: 'resuelta' },
        });

        if (resultado.count > 0) {
          console.log(`[TELEGRAM·DB] ✔ TT_ALERT #${alertId} marcada como resuelta por ${nombreUsuario}.`);
          if (chatId) {
            enviarAlertaTelegram(
              chatId.toString(),
              `✅ <b>Alerta #${alertId} marcada como resuelta.</b>\n\nAcción registrada por: ${nombreUsuario}.`,
            );
          }
        } else {
          console.warn(`[TELEGRAM·DB] TT_ALERT #${alertId} no se encontró en estado 'activa' (¿ya fue resuelta?).`);
          if (chatId) {
            enviarAlertaTelegram(
              chatId.toString(),
              `ℹ️ La alerta <b>#${alertId}</b> ya había sido resuelta anteriormente.`,
            );
          }
        }
      } catch (err: any) {
        console.error(`[TELEGRAM·DB] ✗ Error al resolver TT_ALERT #${alertId}:`, err?.message ?? err);
      }
    }
  }
}

/**
 * Ciclo de Long Polling no bloqueante.
 *
 * Usa `getUpdates` con `timeout=5` (Telegram mantiene la conexión hasta 5 s
 * esperando mensajes, lo que reduce peticiones en reposo). Al finalizar cada
 * ciclo —con o sin error— se programa el siguiente con `setTimeout`, cediendo
 * el hilo principal entre iteraciones.
 *
 * Exportada para ser iniciada desde `index.ts` tras cargar el `.env`.
 */
export async function escucharMensajesTelegram(): Promise<void> {
  const botToken = resolverToken();

  if (!botToken) {
    // El token podría aún no estar disponible en el primer tick; se reintenta.
    setTimeout(escucharMensajesTelegram, POLLING_RETRY_MS);
    return;
  }

  try {
    const url =
      `https://api.telegram.org/bot${botToken}/getUpdates` +
      `?offset=${lastUpdateId + 1}&timeout=5&allowed_updates=["message","callback_query"]`;

    const res = await fetch(url);

    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '');
      console.error(`[TELEGRAM·POLLING] ✗ getUpdates respondió HTTP ${res.status}: ${cuerpo.slice(0, 200)}`);
      setTimeout(escucharMensajesTelegram, POLLING_RETRY_MS);
      return;
    }

    const data: { ok: boolean; result: Record<string, any>[] } = await res.json();

    if (!data.ok) {
      console.error('[TELEGRAM·POLLING] ✗ Telegram devolvió ok=false en getUpdates:', JSON.stringify(data));
      setTimeout(escucharMensajesTelegram, POLLING_RETRY_MS);
      return;
    }

    if (data.result.length > 0) {
      console.log(`[TELEGRAM·POLLING] ${data.result.length} update(s) recibido(s).`);
      for (const update of data.result) {
        await procesarUpdate(update);
      }
    }

    // Ciclo normal: programar el siguiente tick cediendo el hilo
    setTimeout(escucharMensajesTelegram, POLLING_INTERVAL_MS);

  } catch (err: any) {
    console.error('[TELEGRAM·NET] ✗ Error de red en el ciclo de polling:', err?.message ?? err);
    // En caso de fallo de red esperamos más antes de reintentar
    setTimeout(escucharMensajesTelegram, POLLING_RETRY_MS);
  }
}

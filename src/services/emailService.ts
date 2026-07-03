export interface EmailOptions {
  to_email: string;
  to_name: string;
  subject: string;
  title: string;
  message: string;
  extra_data?: string;
  link?: string;
  contextName?: string; // e.g. 'correo de bienvenida', 'recuperación de contraseña'
}

export class EmailService {
  static async sendDynamicEmail(options: EmailOptions) {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    const context = options.contextName || 'correo electrónico';

    if (!serviceId || !templateId || !publicKey) {
      console.warn(`Faltan credenciales de EmailJS en .env. Omitiendo envío de ${context}.`);
      console.log('--- MOCK EMAIL ---');
      console.log(`Para: ${options.to_email}`);
      console.log(`Asunto: ${options.subject}`);
      console.log(`Mensaje: ${options.message}`);
      if (options.extra_data) console.log(`Extra: ${options.extra_data}`);
      console.log('------------------');
      return false;
    }

    const extra_data_html = options.extra_data ? 
      `<div style="background-color: #F8FAFC; border-left: 4px solid #40916C; padding: 15px 20px; border-radius: 4px; margin-bottom: 30px; font-size: 16px; color: #1E293B;">${options.extra_data}</div>` : '';

    const button_html = options.link ? 
      `<table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;"><tr><td align="center" style="border-radius: 6px; background-color: #40916C;"><a href="${options.link}" target="_blank" style="font-size: 16px; font-weight: bold; font-family: sans-serif; color: #ffffff; text-decoration: none; padding: 14px 28px; border: 1px solid #40916C; border-radius: 6px; display: inline-block;">Acceder al Sistema</a></td></tr></table>` : '';

    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        email: options.to_email,
        to_email: options.to_email,
        to_name: options.to_name,
        nombre: options.to_name,
        subject: options.subject,
        title: options.title,
        message: options.message,
        extra_data_html: extra_data_html,
        button_html: button_html
      },
    };

    try {
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error enviando ${context} (${response.status}): ${errorText}`);
        return false;
      }

      console.log(`${context.charAt(0).toUpperCase() + context.slice(1)} enviado exitosamente a ${options.to_email}`);
      return true;
    } catch (error) {
      console.error(`Error de red/sistema al enviar ${context}:`, error);
      return false;
    }
  }
}

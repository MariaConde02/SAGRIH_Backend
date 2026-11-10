import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { prisma } from './db/prismaClient.js';
import authRoutes from './routes/auth.js';
import riegoRoutes from './routes/riego.js';
import canterosRoutes from './routes/canteros.js';
import invernaderosRoutes from './routes/invernaderos.js';
import dispositivosRoutes from './routes/dispositivos.js';
import usuariosRoutes from './routes/usuarios.js';
import alertasRoutes from './routes/alertas.js';
import parametrosRoutes from './routes/parametros.js';
import historialRoutes from './routes/historial.js';
import bitacoraRoutes from './routes/bitacora.js';
import sensoresRoutes from './routes/sensores.js';
import dashboardRoutes from './routes/dashboard.js';
import setupRoutes from './routes/setup.js';
import categoriasRoutes from './routes/categorias.js';
import cultivosRoutes from './routes/cultivos.js';
import simuladorRoutes from './routes/simulador.js';
import auditoriaRoutes from './routes/auditoria.js';
import papeleraRoutes from './routes/papelera.js';
import reportesRoutes from './routes/reportes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startCronJobs } from './services/cron.js';
import { diagnosticarEntornoTelegram, escucharMensajesTelegram } from './services/telegramService.js';

// ─── Variables de entorno ────────────────────────────────────────────────────
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no está definido en las variables de entorno.');
  process.exit(1);
}

// ─── Aplicación Express ──────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── CORS ────────────────────────────────────────────────────────────────────
// Soporta desarrollo local (puertos 5173-5199, 4173), despliegues en Vercel (*.vercel.app)
// y orígenes adicionales configurados por variable de entorno CORS_ORIGIN.
const corsOrigins = [
  'https://sagrih-frontend.vercel.app', // Producción Vercel principal
];
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').forEach((orig) => {
    const trimmed = orig.trim();
    if (trimmed && !corsOrigins.includes(trimmed)) corsOrigins.push(trimmed);
  });
}

const esOrigenDev = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1):(517\d|4173)$/.test(origin);

const esOrigenVercel = (origin: string) =>
  /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (ej. Postman, curl, health checks) o permitidos
    if (!origin || corsOrigins.includes(origin) || esOrigenDev(origin) || esOrigenVercel(origin)) {
      callback(null, true);
    } else {
      // No lanzar Error: responder sin cabeceras CORS para que el navegador
      // rechace la petición limpiamente sin tumbar el pipeline de Express.
      console.warn(`[CORS] Origen no permitido: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/riego', riegoRoutes);
app.use('/api/canteros', canterosRoutes);
app.use('/api/invernaderos', invernaderosRoutes);
app.use('/api/dispositivos', dispositivosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/simulador', simuladorRoutes);
app.use('/api/parametros', parametrosRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/bitacora', bitacoraRoutes);
app.use('/api', sensoresRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/cultivos', cultivosRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/papelera', papeleraRoutes);
app.use('/api/reportes', reportesRoutes);

app.use(errorHandler);

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
diagnosticarEntornoTelegram();
escucharMensajesTelegram();   // Long Polling bidireccional (Módulo 6 · Onboarding)
startCronJobs();

// ─── Arrancar ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SAGRIH API corriendo en http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

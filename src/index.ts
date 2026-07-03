import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no está definido en las variables de entorno.');
  process.exit(1);
}

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
import { errorHandler } from './middleware/errorHandler.js';
import { startCronJobs } from './services/cron.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(morgan('dev'));
app.use(express.json());

import { Request, Response } from 'express';

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

app.use(errorHandler);

startCronJobs();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SAGRIH API corriendo en http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

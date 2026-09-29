import express from 'express';
import mongoose from 'mongoose';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { corsOrigins, env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import clinicRoutes from './modules/clinics/clinic.routes.js';
import patientRoutes from './modules/patients/patient.routes.js';
import prescriptionRoutes from './modules/prescriptions/prescription.routes.js';
import publicPrescriptionRoutes from './modules/prescriptions/public-prescription.routes.js';
import appointmentRoutes from './modules/appointments/appointment.routes.js';
import communicationRoutes from './modules/communications/communication.routes.js';
import whatsappWebhookRoutes from './modules/communications/webhook.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import feedbackRoutes from './modules/feedback/feedback.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import templateRoutes from './modules/templates/template.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import jarvisRoutes from './modules/jarvis/jarvis.routes.js';
import jarvisInternalRoutes from './modules/jarvis/jarvis-internal.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export const HTTP_LOG_REDACT_PATHS = ['req.url', 'req.query', 'req.params', 'req.headers', 'req.remoteAddress', 'req.remotePort', 'res.headers'] as const;

const logger = pino({
  redact: [...HTTP_LOG_REDACT_PATHS],
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  }),
});

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: corsOrigins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
  app.use('/api/v1/webhooks/whatsapp', whatsappWebhookRoutes);
  app.use('/api/v1/internal/jarvis', jarvisInternalRoutes);
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(rateLimit({
    windowMs: 60_000,
    limit: env.NODE_ENV === 'test' ? 10_000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.path === '/ready',
  }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database: ready ? 'connected' : 'disconnected' });
  });
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/clinic', clinicRoutes);
  app.use('/api/v1/patients', patientRoutes);
  app.use('/api/v1/prescriptions', prescriptionRoutes);
  app.use('/api/v1/public/prescriptions', publicPrescriptionRoutes);
  app.use('/api/v1/templates', templateRoutes);
  app.use('/api/v1/appointments', appointmentRoutes);
  app.use('/api/v1/communications', communicationRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/feedback', feedbackRoutes);
  app.use('/api/v1/ai', aiRoutes);
  app.use('/api/v1/inventory', inventoryRoutes);
  app.use('/api/v1/jarvis', jarvisRoutes);
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });
  app.use(errorHandler);
  return app;
}




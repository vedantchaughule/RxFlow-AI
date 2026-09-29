import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { healthRouter } from './routes/health.routes.js';
import { whatsappRouter } from './routes/whatsapp.routes.js';
import { statusRouter } from './routes/status.routes.js';

const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-twilio-signature"]',
      // Redact raw body fields that may contain phone numbers
      'req.body.From',
      'req.body.To',
      'req.body.Body',
    ],
    censor: '[REDACTED]',
  },
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => (req.url === '/health' || req.url === '/ready') } }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter);
  app.use(whatsappRouter);
  app.use(statusRouter);

  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.statusCode || error.status || 500;
    res.status(status).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
    });
  });

  return app;
}

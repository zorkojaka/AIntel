import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import routes from '../routes';
import authRoutes from '../modules/auth/routes/auth.routes';
import { requireAuth } from '../middlewares/auth';
import { responseHelpers } from './response';
import { normalizePayload } from './middleware/normalizePayload';
import { errorHandler } from './errorHandler';
import { isMongoConnected } from '../db/mongo';

function createCorsOptions() {
  if (process.env.NODE_ENV !== 'production') {
    return { origin: true, credentials: true };
  }

  const allowedOrigins = (process.env.AINTEL_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new Error('AINTEL_ALLOWED_ORIGINS is required in production.');
  }

  const allowed = new Set(allowedOrigins);
  return {
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, allowed.has(origin));
    },
  };
}

export function createApp() {
  const app = express();

  app.use(cors(createCorsOptions()));
  app.use(express.json());
  app.use(cookieParser());
  app.use(responseHelpers);
  app.use(normalizePayload);

  app.get('/health', (_req, res) => {
    res.success({ connected: isMongoConnected() });
  });

  app.get('/api/health', (_req, res) => {
    res.success({ connected: isMongoConnected() });
  });

  app.use('/uploads', express.static('/var/www/aintel/uploads'));
  app.use('/api/auth', authRoutes);
  app.use('/api', requireAuth, routes);
  app.use(errorHandler);

  return app;
}

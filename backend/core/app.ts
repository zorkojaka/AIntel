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

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
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

  app.use('/api/auth', authRoutes);
  app.use('/api', requireAuth, routes);
  app.use(errorHandler);

  return app;
}

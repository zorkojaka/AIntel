import fs from 'node:fs';
import path from 'node:path';
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

function resolveWebDistDir() {
  const explicit = process.env.AINTEL_WEB_DIST?.trim();
  const candidates = [
    explicit,
    path.resolve(__dirname, '../../apps/core-shell/dist'),
    path.resolve(__dirname, '../../../apps/core-shell/dist'),
    path.resolve(process.cwd(), '../apps/core-shell/dist'),
    path.resolve(process.cwd(), 'apps/core-shell/dist'),
  ].filter((value): value is string => !!value);

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? null;
}

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

  if (process.env.NODE_ENV === 'production') {
    const webDistDir = resolveWebDistDir();
    if (webDistDir) {
      app.use(express.static(webDistDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
          return next();
        }
        return res.sendFile(path.join(webDistDir, 'index.html'));
      });
    }
  }

  app.use(errorHandler);

  return app;
}

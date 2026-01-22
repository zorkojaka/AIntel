import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import routes from '../routes';
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

  app.use('/api', routes);
  app.use(errorHandler);

  return app;
}

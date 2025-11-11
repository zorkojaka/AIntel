import cors from 'cors';
import express from 'express';
import routes from '../routes';
import { responseHelpers } from './response';
import { normalizePayload } from './middleware/normalizePayload';
import { errorHandler } from './errorHandler';
import { isMongoConnected } from '../db/mongo';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(responseHelpers);
  app.use(normalizePayload);

  app.get('/health', (_req, res) => {
    res.success({ connected: isMongoConnected() });
  });

  app.use('/', routes);
  app.use(errorHandler);

  return app;
}

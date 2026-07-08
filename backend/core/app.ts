import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import routes from '../routes';
import authRoutes from '../modules/auth/routes/auth.routes';
import webInquiryPublicRoutes from '../modules/web-inquiries/public.routes';
import { streamUpload } from '../modules/files/upload-stream';
import { requireAuth } from '../middlewares/auth';
import { responseHelpers } from './response';
import { normalizePayload } from './middleware/normalizePayload';
import { httpLogger } from './middleware/httpLogger';
import { errorHandler } from './errorHandler';
import { isMongoConnected } from '../db/mongo';

const DEFAULT_PRODUCTION_ORIGINS = ['https://aintel.inteligent.si', 'https://testaintel.inteligent.si'];

function createCorsOptions() {
  if (process.env.NODE_ENV !== 'production') {
    return { origin: true, credentials: true };
  }

  const configuredOrigins = (process.env.AINTEL_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_PRODUCTION_ORIGINS, ...configuredOrigins]);
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

  // Structured request logging (request id + latency) wraps every route,
  // including the public intake mounted below.
  app.use(httpLogger);

  // Public intake for the inteligent.si website (before the global CORS allowlist
  // and cookie auth: it is protected by an X-API-Key header and rate limiting).
  app.use('/api/public', express.json(), webInquiryPublicRoutes);

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

  app.use('/api/auth', authRoutes);
  app.get('/uploads/*', requireAuth, streamUpload);
  app.use('/api', requireAuth, routes);
  app.use(errorHandler);

  return app;
}

import './instrument'; // must be first: initialises Sentry before app modules load
import { loadEnvironment } from './loadEnv';
import { createApp } from './core/app';
import { connectToMongo } from './db/mongo';
import { logger } from './core/logger';
import { bootstrapAdminUser } from './modules/auth/services/bootstrap';
import { logSmtpDiagnostics } from './modules/communication/services/email-transport.service';
import { startSchedulerWorker } from './modules/scheduler/worker';

loadEnvironment();
logSmtpDiagnostics('startup');

const port = Number(process.env.PORT ?? 3000);

connectToMongo()
  .then(async () => {
    await bootstrapAdminUser();
    startSchedulerWorker();
  })
  .catch((error) => {
    logger.error({ err: error }, 'MongoDB se ni uspel povezati');
  });

const app = createApp();

app.listen(port, () => {
  logger.info({ port }, `AIntel CORE backend posluša na http://localhost:${port}`);
});

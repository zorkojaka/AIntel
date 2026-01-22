import { loadEnvironment } from './loadEnv';
import { createApp } from './core/app';
import { connectToMongo } from './db/mongo';
import { bootstrapAdminUser } from './modules/auth/services/bootstrap';

loadEnvironment();

const port = Number(process.env.PORT ?? 3000);

connectToMongo()
  .then(() => bootstrapAdminUser())
  .catch((error) => {
    console.error('MongoDB se ni uspel povezati:', error);
  });

const app = createApp();

app.listen(port, () => {
  console.log(`AIntel CORE backend posluša na http://localhost:${port}`);
});

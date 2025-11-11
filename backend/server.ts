import dotenv from 'dotenv';
import { createApp } from './core/app';
import { connectToMongo } from './db/mongo';

dotenv.config();

const port = Number(process.env.PORT ?? 3000);

connectToMongo().catch((error) => {
  console.error('MongoDB se ni uspel povezati:', error);
});

const app = createApp();

app.listen(port, () => {
  console.log(`AIntel CORE backend posluša na http://localhost:${port}`);
});

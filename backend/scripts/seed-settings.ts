import path from 'node:path';
import fs from 'node:fs';

import mongoose from 'mongoose';

import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';
import { SettingsModel } from '../modules/settings/Settings';

const SEED_PATH = path.resolve(__dirname, '..', 'seeds', 'settings.json');

async function seed() {
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed datoteka ne obstaja: ${SEED_PATH}`);
  }

  const raw = fs.readFileSync(SEED_PATH, 'utf8');
  const data = JSON.parse(raw);

  loadEnvironment();
  await connectToMongo();

  await SettingsModel.updateOne({ key: 'global' }, { $set: data, $setOnInsert: { key: 'global' } }, { upsert: true });

  console.log('Nastavitve: seed zaključen.');
}

seed()
  .catch((error) => {
    console.error('Napaka pri sejanju nastavitev:', error);
  })
  .finally(() => {
    mongoose.connection.close();
  });

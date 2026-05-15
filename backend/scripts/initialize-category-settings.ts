import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { initializeCategorySettingsFromProducts } from '../modules/cenik/services/category-settings.service';
import { fetchAAProducts } from '../modules/cenik/sync/aaApiClient';

async function main() {
  loadEnvironment();
  await connectToMongo();

  const products = await fetchAAProducts();
  const settings = await initializeCategorySettingsFromProducts(products);

  console.log(`Initialized category_settings from AA API.`);
  console.log(`AA products scanned: ${products.length}`);
  console.log(`Category settings total: ${settings.length}`);
  console.log(`Active categories: ${settings.filter((setting) => setting.isActive).length}`);
}

main()
  .catch((error) => {
    console.error('Category settings initialization failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

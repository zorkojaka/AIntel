/**
 * Prenos objavljene izložbe v WooCommerce trgovino (isti kod kot gumb
 * »Prenesi v trgovino« v modulu Cenik → Izložba). Nastavitve bere iz
 * kolekcije shop_settings (key: 'woocommerce').
 *
 *   npx tsx scripts/shop-sync.ts
 */
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { runShopSync } from '../modules/shop/woocommerce-sync.service';

async function main() {
  loadEnvironment();
  await connectToMongo();
  const state = await runShopSync();
  console.log(JSON.stringify(state, null, 2));
  await mongoose.disconnect();
  // uvoženi moduli (PDF engine ipd.) držijo event loop odprt — izhod je ekspliciten
  process.exit(state.status === 'done' ? 0 : 1);
}

main().catch((error) => {
  console.error('Sinhronizacija ni uspela:', error instanceof Error ? error.message : error);
  process.exit(1);
});

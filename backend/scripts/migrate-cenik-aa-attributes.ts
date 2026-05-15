import 'dotenv/config';
import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { ProductModel } from '../modules/cenik/product.model';
import { fetchAAProducts } from '../modules/cenik/sync/aaApiClient';
import { mapAAProductToImportItem } from '../modules/cenik/sync/aaProductMapper';

async function migrate() {
  console.log('Migration: fill aaData and classification for AA products');
  await connectToMongo();

  const apiProducts = await fetchAAProducts();
  const apiById = new Map(apiProducts.map((product) => [product.id, product]));
  console.log(`Fetched ${apiProducts.length} products from AA`);

  const dbProducts = await ProductModel.find({ externalSource: 'aa_api' });
  console.log(`Found ${dbProducts.length} AA products in DB`);

  let updated = 0;
  let notFound = 0;

  for (const dbProduct of dbProducts) {
    const apiProduct = apiById.get(dbProduct.externalId ?? '');
    if (!apiProduct) {
      notFound += 1;
      continue;
    }

    const mapped = mapAAProductToImportItem(apiProduct);
    dbProduct.aaData = mapped.aaData;
    dbProduct.classification = mapped.classification;
    dbProduct.proizvajalec = dbProduct.proizvajalec || mapped.proizvajalec;
    dbProduct.kategorija = dbProduct.kategorija || mapped.kategorija;
    if (!dbProduct.categorySlugs?.length) {
      dbProduct.categorySlugs = mapped.categorySlugs;
    }

    await dbProduct.save();
    updated += 1;

    if (updated % 50 === 0) {
      console.log(`Progress: ${updated} / ${dbProducts.length}`);
    }
  }

  console.log('Migration complete');
  console.log(`Updated: ${updated}`);
  console.log(`Not found in API: ${notFound}`);
  console.log(`Total in DB: ${dbProducts.length}`);
}

migrate()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });

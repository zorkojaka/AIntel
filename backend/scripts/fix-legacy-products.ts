import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';

type ProductRecord = {
  _id: unknown;
  ime?: string;
  externalKey?: string;
  externalId?: string;
  externalSource?: string;
  isActive?: boolean;
};

type FixOptions = {
  confirm: boolean;
};

function parseArgs(): FixOptions {
  const args = process.argv.slice(2);
  return {
    confirm: args.includes('--confirm')
  };
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

async function runFix({ confirm }: FixOptions) {
  loadEnvironment();
  await connectToMongo();

  const legacyProducts = (await ProductModel.find({
    $or: [{ externalSource: { $exists: false } }, { externalSource: '' }, { externalSource: null }]
  })
    .sort({ _id: 1 })
    .select('_id ime externalKey externalId externalSource isActive')
    .lean()) as ProductRecord[];

  console.log(`LEGACY_PRODUCTS_FOUND: ${legacyProducts.length}`);

  if (legacyProducts.length === 0) {
    return;
  }

  for (const product of legacyProducts) {
    const id = String(product._id ?? '');
    const ime = normalizeString(product.ime);
    const externalKey = normalizeString(product.externalKey);
    const externalId = normalizeString(product.externalId);
    const externalSource = normalizeString(product.externalSource);

    console.log(
      JSON.stringify({
        _id: id,
        ime,
        externalKey: externalKey || null,
        externalId: externalId || null,
        externalSource: externalSource || null
      })
    );

    if (!confirm) {
      continue;
    }

    const legacyKey = `legacy:${id}`;

    await ProductModel.updateOne(
      { _id: product._id },
      {
        $set: {
          externalSource: 'legacy',
          externalKey: legacyKey,
          isActive: false
        }
      }
    );
  }

  if (!confirm) {
    console.log('Dry-run only. Re-run with --confirm to apply changes.');
  } else {
    console.log('Legacy products updated.');
  }
}

const options = parseArgs();

runFix(options)
  .catch((error) => {
    console.error('Fix legacy products failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

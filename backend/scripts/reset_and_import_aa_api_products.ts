import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';

type RawInput = {
  meta?: unknown;
  products?: unknown;
};

type ProductRecord = Record<string, unknown>;

const INPUT_PATH = path.resolve(__dirname, '..', 'data', 'cenik', 'aa_api_produkti.json');
const REQUIRED_SLUGS = ['ajax', 'kamera', 'internet'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function assertField(obj: ProductRecord, key: string, index: number, errors: string[]) {
  if (!hasOwn(obj, key)) {
    errors.push(`[${index}] missing field "${key}"`);
  }
}

function assertString(value: unknown, key: string, index: number, errors: string[]) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`[${index}] "${key}" must be a non-empty string`);
  }
}

function assertStringOrNull(value: unknown, key: string, index: number, errors: string[]) {
  if (!(value === null || typeof value === 'string')) {
    errors.push(`[${index}] "${key}" must be string or null`);
  }
}

function assertNumber(value: unknown, key: string, index: number, errors: string[]) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`[${index}] "${key}" must be a finite number`);
  }
}

function validateProduct(product: unknown, index: number, errors: string[]) {
  if (!isPlainObject(product)) {
    errors.push(`[${index}] product is not an object`);
    return;
  }

  const requiredFields = [
    'externalSource',
    'externalId',
    'externalKey',
    'ime',
    'kategorija',
    'categorySlugs',
    'nabavnaCena',
    'prodajnaCena',
    'purchasePriceWithoutVat',
    'kratekOpis',
    'dolgOpis',
    'povezavaDoSlike',
    'povezavaDoProdukta',
    'proizvajalec',
    'dobavitelj',
    'naslovDobavitelja',
    'casovnaNorma',
    'isService'
  ];

  for (const field of requiredFields) {
    assertField(product, field, index, errors);
  }

  if (product.externalSource !== 'aa_api') {
    errors.push(`[${index}] "externalSource" must be "aa_api"`);
  }

  assertString(product.externalId, 'externalId', index, errors);
  assertString(product.externalKey, 'externalKey', index, errors);

  if (typeof product.externalId === 'string' && typeof product.externalKey === 'string') {
    const expectedKey = `aa_api:${product.externalId}`;
    if (product.externalKey !== expectedKey) {
      errors.push(`[${index}] "externalKey" must be "${expectedKey}"`);
    }
  }

  assertString(product.ime, 'ime', index, errors);
  assertStringOrNull(product.kategorija, 'kategorija', index, errors);

  if (!Array.isArray(product.categorySlugs) || product.categorySlugs.length === 0) {
    errors.push(`[${index}] "categorySlugs" must be a non-empty array`);
  } else if (!product.categorySlugs.every((slug) => typeof slug === 'string' && slug.trim().length > 0)) {
    errors.push(`[${index}] "categorySlugs" must contain non-empty strings`);
  }

  assertNumber(product.nabavnaCena, 'nabavnaCena', index, errors);
  assertNumber(product.prodajnaCena, 'prodajnaCena', index, errors);
  assertNumber(product.purchasePriceWithoutVat, 'purchasePriceWithoutVat', index, errors);

  assertStringOrNull(product.kratekOpis, 'kratekOpis', index, errors);
  assertStringOrNull(product.dolgOpis, 'dolgOpis', index, errors);
  assertStringOrNull(product.povezavaDoSlike, 'povezavaDoSlike', index, errors);
  assertStringOrNull(product.povezavaDoProdukta, 'povezavaDoProdukta', index, errors);
  assertStringOrNull(product.proizvajalec, 'proizvajalec', index, errors);

  assertString(product.dobavitelj, 'dobavitelj', index, errors);
  assertString(product.naslovDobavitelja, 'naslovDobavitelja', index, errors);

  if (product.casovnaNorma !== 0) {
    errors.push(`[${index}] "casovnaNorma" must be 0`);
  }

  if (product.isService !== false) {
    errors.push(`[${index}] "isService" must be false`);
  }
}

function summarizeErrors(errors: string[]) {
  const limit = 20;
  const head = errors.slice(0, limit).join('\n');
  const suffix = errors.length > limit ? `\n...and ${errors.length - limit} more` : '';
  return `${head}${suffix}`;
}

function loadInputFile() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input file not found: ${INPUT_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  const parsed = JSON.parse(raw) as RawInput;

  if (!isPlainObject(parsed) || !Array.isArray(parsed.products)) {
    throw new Error('Input file must be an object with a "products" array.');
  }

  return parsed.products;
}

function countBySlug(products: ProductRecord[], slug: string) {
  return products.filter((product) => Array.isArray(product.categorySlugs) && product.categorySlugs.includes(slug)).length;
}

async function inspectBeforeDelete() {
  const totalBefore = await ProductModel.countDocuments();
  console.log(`BEFORE count: ${totalBefore}`);

  const sample = await ProductModel.findOne().lean();
  if (!sample) {
    console.log('BEFORE sample: <none>');
  } else {
    const sampleKeys = Object.keys(sample);
    console.log('BEFORE sample _id:', sample._id);
    console.log('BEFORE sample keys:', sampleKeys.join(', '));
    console.log('BEFORE has externalKey:', hasOwn(sample as ProductRecord, 'externalKey'));
    console.log('BEFORE has categorySlugs:', hasOwn(sample as ProductRecord, 'categorySlugs'));
    console.log('BEFORE has prodajnaCena:', hasOwn(sample as ProductRecord, 'prodajnaCena'));
  }

  const examples = await ProductModel.find().limit(3).lean();
  if (examples.length === 0) {
    console.log('BEFORE examples: <none>');
    return;
  }

  console.log('BEFORE examples:');
  for (const [index, doc] of examples.entries()) {
    const keys = Object.keys(doc as ProductRecord).join(', ');
    const externalKey = (doc as ProductRecord).externalKey ?? '<missing>';
    const ime = (doc as ProductRecord).ime ?? '<missing>';
    console.log(`  [${index}] keys: ${keys}`);
    console.log(`  [${index}] externalKey: ${externalKey}, ime: ${ime}`);
  }
}

async function main() {
  loadEnvironment();
  await connectToMongo();

  if (!ProductModel?.collection) {
    throw new Error('Product model is not available. Aborting.');
  }

  await inspectBeforeDelete();

  const productsRaw = loadInputFile();
  const errors: string[] = [];

  productsRaw.forEach((product, index) => validateProduct(product, index, errors));

  if (errors.length > 0) {
    throw new Error(`Input validation failed:\n${summarizeErrors(errors)}`);
  }

  const products = productsRaw as ProductRecord[];
  console.log(`INPUT products: ${products.length}`);

  for (const slug of REQUIRED_SLUGS) {
    const count = countBySlug(products, slug);
    console.log(`INPUT slug ${slug}: ${count}`);
  }

  if (process.env.CONFIRM_RESET !== 'YES') {
    console.log('CONFIRM_RESET is not set to YES. Stopping before delete.');
    return;
  }

  const deleted = await ProductModel.deleteMany({});
  console.log(`DELETED: ${deleted.deletedCount ?? 0}`);

  let insertedCount = 0;
  try {
    const inserted = await ProductModel.insertMany(products, { ordered: false });
    insertedCount = inserted.length;
  } catch (error) {
    const bulkError = error as { result?: { insertedCount?: number }; insertedDocs?: unknown[] };
    insertedCount = bulkError.result?.insertedCount ?? bulkError.insertedDocs?.length ?? 0;
    console.error('Insert completed with errors. Continuing with post-checks.');
  }
  console.log(`INSERTED: ${insertedCount}`);

  const totalAfter = await ProductModel.countDocuments();
  console.log(`AFTER count: ${totalAfter}`);

  const ajaxSample = await ProductModel.findOne({ categorySlugs: 'ajax' }).lean();
  const kameraSample = await ProductModel.findOne({ categorySlugs: 'kamera' }).lean();

  if (!ajaxSample || !kameraSample) {
    throw new Error('Post-check failed: missing ajax or kamera products.');
  }

  console.log('SAMPLE ajax OK / kamera OK');
}

main()
  .catch((error) => {
    console.error('AA API reset/import failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

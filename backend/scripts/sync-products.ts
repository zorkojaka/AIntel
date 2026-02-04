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

type SyncOptions = {
  source: string;
  inputPath: string;
  confirm: boolean;
};

const DEFAULT_INPUTS: Record<string, string> = {
  aa_api: path.resolve(__dirname, '..', 'data', 'cenik', 'aa_api_produkti.json'),
  services_sheet: path.resolve(__dirname, '..', 'data', 'cenik', 'custom_storitve.json')
};

const LOCK_TTL_MINUTES = 30;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, key: string, index: number, errors: string[]) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`[${index}] "${key}" must be a non-empty string`);
  }
}

function assertPositiveNumber(value: unknown, key: string, index: number, errors: string[]) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`[${index}] "${key}" must be a number > 0`);
  }
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeCode(value: unknown) {
  return normalizeText(value);
}

function validateProduct(product: unknown, index: number, errors: string[], source: string) {
  if (!isPlainObject(product)) {
    errors.push(`[${index}] product is not an object`);
    return false;
  }

  assertString(product.externalKey, 'externalKey', index, errors);
  if (source === 'aa_api') {
    assertString(product.externalId, 'externalId', index, errors);
  }
  assertString(product.ime, 'ime', index, errors);

  if (!Array.isArray(product.categorySlugs) || product.categorySlugs.length === 0) {
    errors.push(`[${index}] "categorySlugs" must be a non-empty array`);
  } else if (!product.categorySlugs.every((slug) => typeof slug === 'string' && slug.trim().length > 0)) {
    errors.push(`[${index}] "categorySlugs" must contain non-empty strings`);
  }

  assertPositiveNumber(product.prodajnaCena, 'prodajnaCena', index, errors);

  if (product.externalSource && product.externalSource !== source) {
    errors.push(`[${index}] "externalSource" must be "${source}"`);
  }

  return errors.length === 0;
}

function summarizeErrors(errors: string[]) {
  const limit = 20;
  const head = errors.slice(0, limit).join('\n');
  const suffix = errors.length > limit ? `\n...and ${errors.length - limit} more` : '';
  return `${head}${suffix}`;
}

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: Partial<SyncOptions> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--source') {
      options.source = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--input') {
      options.inputPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--confirm') {
      options.confirm = true;
    }
  }

  const source = options.source?.trim();
  if (!source) {
    throw new Error('Missing --source argument.');
  }

  const inputPath = options.inputPath?.trim() || DEFAULT_INPUTS[source];
  if (!inputPath) {
    throw new Error(`No input path for source "${source}". Use --input.`);
  }

  return {
    source,
    inputPath,
    confirm: options.confirm ?? false
  };
}

function loadSnapshot(inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as RawInput;
  if (!isPlainObject(parsed) || !Array.isArray(parsed.products)) {
    throw new Error('Input file must be an object with a "products" array.');
  }

  return parsed.products;
}

async function acquireLock(source: string) {
  const collection = mongoose.connection.collection('import_locks');
  const lockId = `product-import:${source}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MINUTES * 60 * 1000);
  const existing = await collection.findOne({ _id: lockId });
  if (existing && existing.expiresAt && existing.expiresAt > now) {
    return false;
  }
  if (existing) {
    await collection.deleteOne({ _id: lockId });
  }
  try {
    await collection.insertOne({ _id: lockId, source, createdAt: now, expiresAt });
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(source: string) {
  const collection = mongoose.connection.collection('import_locks');
  const lockId = `product-import:${source}`;
  await collection.deleteOne({ _id: lockId });
}

function getExternalId(product: ProductRecord, source: string) {
  if (typeof product.externalId === 'string' && product.externalId.trim().length > 0) {
    return product.externalId.trim();
  }
  if (typeof product.externalKey === 'string' && product.externalKey.startsWith(`${source}:`)) {
    return product.externalKey.slice(source.length + 1).trim();
  }
  return '';
}

function buildExternalKey(source: string, externalId: string, fallbackCode: string) {
  if (externalId) {
    return `${source}:${externalId}`;
  }
  if (fallbackCode) {
    return `${source}:${fallbackCode}`;
  }
  return '';
}

function normalizeProductRecord(product: ProductRecord) {
  const normalized: ProductRecord = { ...product };
  if (typeof product.ime === 'string') normalized.ime = normalizeText(product.ime);
  if (typeof product.kategorija === 'string') normalized.kategorija = normalizeCode(product.kategorija);
  if (Array.isArray(product.categorySlugs)) {
    normalized.categorySlugs = product.categorySlugs
      .filter((slug) => typeof slug === 'string')
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean);
  }
  return normalized;
}

async function runSync({ source, inputPath, confirm }: SyncOptions) {
  loadEnvironment();
  await connectToMongo();

  if (!ProductModel?.collection) {
    throw new Error('Product model is not available. Aborting.');
  }

  const lockAcquired = await acquireLock(source);
  if (!lockAcquired) {
    throw new Error(`Import lock already held for source "${source}". Aborting.`);
  }

  const rawProducts = loadSnapshot(inputPath);
  const validationErrors: string[] = [];
  const products: ProductRecord[] = [];
  let invalidCount = 0;

  rawProducts.forEach((product, index) => {
    const errors: string[] = [];
    if (validateProduct(product, index, errors, source)) {
      products.push(normalizeProductRecord(product as ProductRecord));
    } else {
      validationErrors.push(...errors);
      invalidCount += 1;
    }
  });

  if (validationErrors.length > 0) {
    console.error(`INVALID products: ${invalidCount}`);
    console.error(`Validation errors:\n${summarizeErrors(validationErrors)}`);
  }

  const snapshotKeys = products.map((product) => String(product.externalKey ?? ''));

  const operations = products.map((product) => {
    const externalId = getExternalId(product, source);
    const fallbackCode = normalizeCode(product.externalKey ?? product.kategorija ?? '');
    const externalKey = buildExternalKey(source, externalId, fallbackCode) || String(product.externalKey ?? '');
    const now = new Date();
    const filter = externalId
      ? { externalSource: source, externalId }
      : { externalSource: source, externalKey };

    return {
      updateOne: {
        filter,
        update: {
          $set: {
            ...product,
            externalSource: source,
            externalId,
            externalKey,
            updatedAt: now,
            isActive: true
          },
          $setOnInsert: { createdAt: now }
        },
        upsert: true
      }
    };
  });

  const bulkResult = operations.length
    ? await ProductModel.bulkWrite(operations, { ordered: false })
    : { upsertedCount: 0, modifiedCount: 0 };
  const inserted = (bulkResult as { upsertedCount?: number }).upsertedCount ?? 0;
  const updated = (bulkResult as { modifiedCount?: number }).modifiedCount ?? 0;

  const deactivateQuery = {
    externalSource: source,
    externalKey: { $nin: snapshotKeys }
  };

  const wouldDeactivate = await ProductModel.countDocuments(deactivateQuery);

  console.log(`SYNC source: ${source}`);
  console.log(`INPUT products: ${products.length}`);
  console.log(`INSERTED: ${inserted}`);
  console.log(`UPDATED: ${updated}`);
  console.log(`INVALID: ${invalidCount}`);
  console.log(`WOULD_DEACTIVATE: ${wouldDeactivate}`);

  if (!confirm) {
    console.log('CONFIRM mode not enabled. Skipping deactivation.');
    return;
  }

  if (invalidCount > 0) {
    console.log('Invalid products detected. Skipping deactivation to avoid drift.');
    return;
  }

  const deactivateResult = await ProductModel.updateMany(deactivateQuery, {
    $set: { isActive: false, updatedAt: new Date() }
  });
  console.log(`DEACTIVATED: ${deactivateResult.modifiedCount ?? 0}`);
}

const options = parseArgs();

runSync(options)
  .catch((error) => {
    console.error('Product sync failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    releaseLock(options.source)
      .catch(() => undefined)
      .finally(() => {
        mongoose.connection.close();
      });
  });

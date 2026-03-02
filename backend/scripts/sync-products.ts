import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductSyncValidationError, syncProductsFromItems } from '../modules/cenik/services/product-sync.service';

type RawInput = {
  meta?: unknown;
  products?: unknown;
};

type SyncOptions = {
  source: string;
  inputPath: string;
  confirm: boolean;
};

const DEFAULT_INPUTS: Record<string, string> = {
  aa_api: path.resolve(__dirname, '..', 'data', 'cenik', 'aa_api_produkti.json'),
  services_sheet: path.resolve(__dirname, '..', 'data', 'cenik', 'custom_storitve.json')
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function summarizeValidationErrors(errors: Array<{ index: number; rowId: string; field: string; reason: string }>) {
  const limit = 40;
  const head = errors.slice(0, limit);
  const lines = head.map((error) => `[${error.index}] ${error.rowId} ${error.field}: ${error.reason}`);
  const suffix = errors.length > limit ? `\n...and ${errors.length - limit} more` : '';
  return `${lines.join('\n')}${suffix}`;
}

async function runSync({ source, inputPath, confirm }: SyncOptions) {
  loadEnvironment();
  await connectToMongo();

  const rawProducts = loadSnapshot(inputPath);

  const report = await syncProductsFromItems({ source, items: rawProducts, confirm });

  console.log(`SYNC source: ${report.source}`);
  console.log(`INPUT products: ${report.total}`);
  console.log(`CREATED: ${report.created}`);
  console.log(`UPDATED: ${report.updated}`);
  console.log(`REACTIVATED: ${report.reactivated}`);
  console.log(`WOULD_DEACTIVATE: ${report.wouldDeactivate}`);
  if (confirm) {
    console.log(`DEACTIVATED: ${report.deactivated}`);
  } else {
    console.log('CONFIRM mode not enabled. Skipping deactivation.');
  }
}

const options = parseArgs();

runSync(options)
  .catch((error) => {
    if (error instanceof ProductSyncValidationError) {
      console.error(`VALIDATION_FAILED: ${error.errors.length} issue(s)`);
      console.error(`Errors:\n${summarizeValidationErrors(error.errors)}`);
      process.exitCode = 1;
      return;
    }
    console.error('Product sync failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

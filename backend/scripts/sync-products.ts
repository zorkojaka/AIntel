import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { applyProductImportFromItems } from '../modules/cenik/services/product-sync.service';

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

async function runSync({ source, inputPath, confirm }: SyncOptions) {
  loadEnvironment();
  await connectToMongo();

  const rawProducts = loadSnapshot(inputPath);

  const result = await applyProductImportFromItems({ source, items: rawProducts });

  console.log(`SYNC source: ${result.source}`);
  console.log(`TOTAL_SOURCE_ROWS: ${result.summary.totalSourceRows}`);
  console.log(`MATCHED_ROWS: ${result.summary.matchedRows}`);
  console.log(`TO_CREATE: ${result.summary.toCreateCount}`);
  console.log(`TO_UPDATE: ${result.summary.toUpdateCount}`);
  console.log(`TO_SKIP: ${result.summary.toSkipCount}`);
  console.log(`CONFLICTS: ${result.summary.conflictCount}`);
  console.log(`INVALID: ${result.summary.invalidCount}`);
  console.log(`CREATED: ${result.applied.createdCount}`);
  console.log(`UPDATED: ${result.applied.updatedCount}`);
  console.log(`SKIPPED: ${result.applied.skippedCount}`);

  if (result.conflicts.length > 0) {
    console.log('CONFLICT_SAMPLE:');
    result.conflicts.slice(0, 10).forEach((row) => {
      console.log(`  [${row.rowIndex}] ${row.rowId} ${row.ime} -> ${row.reason}`);
    });
  }

  if (result.invalidRows.length > 0) {
    console.log('INVALID_SAMPLE:');
    result.invalidRows.slice(0, 10).forEach((row) => {
      const firstError = row.errors[0];
      console.log(`  [${row.rowIndex}] ${row.rowId} ${firstError?.field ?? 'row'}: ${firstError?.reason ?? 'invalid'}`);
    });
  }

  if (!confirm) {
    console.log('Note: deactivation is not part of the full re-sync flow.');
  }
}

const options = parseArgs();

runSync(options)
  .catch((error) => {
    console.error('Product sync failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

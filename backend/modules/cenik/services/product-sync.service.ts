import mongoose from 'mongoose';

import { ProductModel } from '../product.model';

type NormalizedProduct = {
  externalSource: string;
  externalId: string;
  externalKey: string;
  ime: string;
  kategorija?: string;
  categorySlugs: string[];
  purchasePriceWithoutVat?: number;
  nabavnaCena: number;
  prodajnaCena: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  povezavaDoProdukta?: string;
  proizvajalec?: string;
  dobavitelj: string;
  naslovDobavitelja?: string;
  casovnaNorma?: string;
  isService: boolean;
};

export type ValidationError = {
  index: number;
  rowId: string;
  field: string;
  reason: string;
};

export type SyncReport = {
  source: string;
  total: number;
  created: number;
  updated: number;
  reactivated: number;
  wouldDeactivate: number;
  deactivated: number;
};

export type SyncProductsRequest = {
  source: string;
  items: unknown[];
  confirm: boolean;
};

export class ProductSyncValidationError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super('Input validation failed. No changes applied.');
    this.name = 'ProductSyncValidationError';
    this.errors = errors;
  }
}

const LOCK_TTL_MINUTES = 30;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeCategorySlugs(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const collected: string[] = [];

  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const cleaned = normalizeText(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    collected.push(cleaned);
  }

  return collected.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function assertBoolean(value: unknown) {
  return typeof value === 'boolean';
}

function assertNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildExternalKey(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries) as T;
}

function validateAndNormalize(
  product: unknown,
  index: number,
  source: string,
  seenKeys: Map<string, number>,
  errors: ValidationError[]
): NormalizedProduct | null {
  const errorStart = errors.length;

  if (!isPlainObject(product)) {
    errors.push({ index, rowId: `row:${index}`, field: 'product', reason: 'must be an object' });
    return null;
  }

  const externalIdRaw = normalizeText(product.externalId);
  const rowId = externalIdRaw ? `externalId:${externalIdRaw}` : `row:${index}`;

  if (!externalIdRaw) {
    errors.push({ index, rowId, field: 'externalId', reason: 'must be a non-empty string' });
  }

  const computedExternalKey = externalIdRaw ? buildExternalKey(source, externalIdRaw) : '';

  if (typeof product.externalSource === 'string' && product.externalSource.trim() !== source) {
    errors.push({ index, rowId, field: 'externalSource', reason: `must be "${source}"` });
  }

  if (typeof product.externalKey === 'string' && product.externalKey.trim().length > 0) {
    const incomingKey = product.externalKey.trim();
    if (computedExternalKey && incomingKey !== computedExternalKey) {
      errors.push({ index, rowId, field: 'externalKey', reason: `must be "${computedExternalKey}"` });
    }
  }

  if (computedExternalKey) {
    const existingIndex = seenKeys.get(computedExternalKey);
    if (existingIndex !== undefined) {
      errors.push({
        index,
        rowId,
        field: 'externalKey',
        reason: `duplicate in input (also at row ${existingIndex})`
      });
    } else {
      seenKeys.set(computedExternalKey, index);
    }
  }

  const ime = normalizeText(product.ime);
  if (!ime) {
    errors.push({ index, rowId, field: 'ime', reason: 'must be a non-empty string' });
  }

  const prodajnaCena = product.prodajnaCena;
  if (!assertNumber(prodajnaCena) || (prodajnaCena as number) <= 0) {
    errors.push({ index, rowId, field: 'prodajnaCena', reason: 'must be a number > 0' });
  }

  const nabavnaCena = product.nabavnaCena;
  if (!assertNumber(nabavnaCena) || (nabavnaCena as number) < 0) {
    errors.push({ index, rowId, field: 'nabavnaCena', reason: 'must be a number >= 0' });
  }

  const dobavitelj = normalizeText(product.dobavitelj);
  if (!dobavitelj) {
    errors.push({ index, rowId, field: 'dobavitelj', reason: 'must be a non-empty string' });
  }

  if (!assertBoolean(product.isService)) {
    errors.push({ index, rowId, field: 'isService', reason: 'must be a boolean' });
  }

  const categorySlugs = normalizeCategorySlugs(product.categorySlugs);
  if (categorySlugs.length === 0) {
    errors.push({ index, rowId, field: 'categorySlugs', reason: 'must be a non-empty array' });
  }

  if (errors.length > errorStart) {
    return null;
  }

  const normalized: NormalizedProduct = {
    externalSource: source,
    externalId: externalIdRaw,
    externalKey: computedExternalKey,
    ime,
    kategorija: normalizeText(product.kategorija) || undefined,
    categorySlugs,
    purchasePriceWithoutVat: assertNumber(product.purchasePriceWithoutVat)
      ? (product.purchasePriceWithoutVat as number)
      : undefined,
    nabavnaCena: nabavnaCena as number,
    prodajnaCena: prodajnaCena as number,
    kratekOpis: normalizeText(product.kratekOpis) || undefined,
    dolgOpis: normalizeText(product.dolgOpis) || undefined,
    povezavaDoSlike: normalizeUrl(product.povezavaDoSlike) || undefined,
    povezavaDoProdukta: normalizeUrl(product.povezavaDoProdukta) || undefined,
    proizvajalec: normalizeText(product.proizvajalec) || undefined,
    dobavitelj,
    naslovDobavitelja: normalizeText(product.naslovDobavitelja) || undefined,
    casovnaNorma: normalizeText(product.casovnaNorma) || undefined,
    isService: product.isService as boolean
  };

  return normalized;
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

export async function syncProductsFromItems({ source, items, confirm }: SyncProductsRequest): Promise<SyncReport> {
  const errors: ValidationError[] = [];
  const products: NormalizedProduct[] = [];
  const seenKeys = new Map<string, number>();

  items.forEach((product, index) => {
    const normalized = validateAndNormalize(product, index, source, seenKeys, errors);
    if (normalized) {
      products.push(normalized);
    }
  });

  if (errors.length > 0) {
    throw new ProductSyncValidationError(errors);
  }

  if (!ProductModel?.collection) {
    throw new Error('Product model is not available. Aborting.');
  }

  const lockAcquired = await acquireLock(source);
  if (!lockAcquired) {
    throw new Error(`Import lock already held for source "${source}". Aborting.`);
  }

  try {
    const snapshotKeys = products.map((product) => product.externalKey);
    const now = new Date();

    const reactivated = await ProductModel.countDocuments({
      externalSource: source,
      externalKey: { $in: snapshotKeys },
      isActive: false
    });

    const operations = products.map((product) => ({
      updateOne: {
        filter: { externalKey: product.externalKey },
        update: {
          $set: removeUndefined({
            ...product,
            updatedAt: now,
            isActive: true
          }),
          $setOnInsert: { createdAt: now }
        },
        upsert: true
      }
    }));

    const bulkResult = operations.length
      ? await ProductModel.bulkWrite(operations, { ordered: false })
      : { upsertedCount: 0, modifiedCount: 0 };

    const created = (bulkResult as { upsertedCount?: number }).upsertedCount ?? 0;
    const updated = (bulkResult as { modifiedCount?: number }).modifiedCount ?? 0;

    const deactivateQuery = {
      externalSource: source,
      externalKey: { $nin: snapshotKeys }
    };

    const wouldDeactivate = await ProductModel.countDocuments(deactivateQuery);

    let deactivated = 0;

    if (confirm) {
      const deactivateResult = await ProductModel.updateMany(deactivateQuery, {
        $set: { isActive: false, updatedAt: new Date() }
      });
      deactivated = deactivateResult.modifiedCount ?? 0;
    }

    return {
      source,
      total: products.length,
      created,
      updated,
      reactivated,
      wouldDeactivate,
      deactivated
    };
  } finally {
    await releaseLock(source).catch(() => undefined);
  }
}

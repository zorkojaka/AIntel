import mongoose from 'mongoose';

import {
  ProductImportConflictResolutionAction,
  ProductImportConflictResolutionModel,
} from '../import-conflict-resolution.model';
import { ProductModel } from '../product.model';
import { IMPORT_DEFAULTS } from '../sync/importDefaults';

type NormalizedProduct = {
  source: string;
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
  defaultExecutionMode?: 'simple' | 'per_unit' | 'measured';
  defaultInstructionsTemplate?: string;
  rowIndex: number;
  rowId: string;
  rowFingerprint: string;
  normalizedName: string;
  strictBusinessKey: string;
  weakNameKey: string;
  providedFields?: string[];
};

type ExistingProduct = {
  _id: mongoose.Types.ObjectId;
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
  ime?: string;
  kategorija?: string;
  categorySlugs?: string[];
  purchasePriceWithoutVat?: number;
  nabavnaCena?: number;
  prodajnaCena?: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  povezavaDoProdukta?: string;
  proizvajalec?: string;
  dobavitelj?: string;
  naslovDobavitelja?: string;
  casovnaNorma?: string;
  isService?: boolean;
  defaultExecutionMode?: 'simple' | 'per_unit' | 'measured';
  defaultInstructionsTemplate?: string;
  isActive?: boolean;
  mergedIntoProductId?: mongoose.Types.ObjectId;
  status?: string;
};

export type ValidationError = {
  index: number;
  rowId: string;
  field: string;
  reason: string;
};

export type ImportActionType = 'create' | 'update' | 'skip' | 'conflict' | 'invalid';
export type MatchType =
  | 'external_key'
  | 'source_identifier'
  | 'strict_business_match'
  | 'resolution_link'
  | 'resolution_skip'
  | 'new_product';

type PlanRowBase = {
  rowIndex: number;
  rowId: string;
  source: string;
  sourceRecordId: string;
  externalKey: string;
  ime: string;
  rowFingerprint: string;
};

type ImportIncomingProductData = {
  ime: string;
  proizvajalec: string;
  dobavitelj: string;
  categorySlugs: string[];
  nabavnaCena: number;
  prodajnaCena: number;
  isService: boolean;
};

export type CandidateMatch = {
  productId: string;
  ime: string;
  proizvajalec: string;
  dobavitelj: string;
  externalKey: string;
  source: string;
  isService: boolean;
  nabavnaCena?: number;
  prodajnaCena?: number;
  matchExplanation: string;
};

export type ImportCreateRow = PlanRowBase & {
  action: 'create';
  matchType: 'new_product';
};

export type ImportUpdateRow = PlanRowBase & {
  action: 'update';
  productId: string;
  matchType: Exclude<MatchType, 'new_product'>;
  changedFields: string[];
};

export type ImportSkipRow = PlanRowBase & {
  action: 'skip';
  productId?: string;
  matchType: Exclude<MatchType, 'new_product'>;
};

export type ImportConflictRow = PlanRowBase & {
  action: 'conflict';
  reason: string;
  incoming: ImportIncomingProductData;
  candidateMatches: CandidateMatch[];
};

export type ImportInvalidRow = PlanRowBase & {
  action: 'invalid';
  errors: ValidationError[];
};

export type ImportPlanSummary = {
  totalSourceRows: number;
  matchedRows: number;
  toCreateCount: number;
  toUpdateCount: number;
  toSkipCount: number;
  conflictCount: number;
  invalidCount: number;
};

export type ImportPlan = {
  source: string;
  summary: ImportPlanSummary;
  toCreate: ImportCreateRow[];
  toUpdate: ImportUpdateRow[];
  toSkip: ImportSkipRow[];
  conflicts: ImportConflictRow[];
  invalidRows: ImportInvalidRow[];
};

export type ImportApplySummary = ImportPlanSummary & {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  excludedConflictCount: number;
  excludedInvalidCount: number;
};

export type AppliedImportPlan = ImportPlan & {
  applied: ImportApplySummary;
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
  confirm?: boolean;
};

export type ResolveImportConflictRequest = {
  source: string;
  externalKey: string;
  sourceRecordId: string;
  rowFingerprint: string;
  action: ProductImportConflictResolutionAction;
  targetProductId?: string;
};

type StoredConflictResolution = {
  source: string;
  externalId: string;
  externalKey: string;
  rowFingerprint: string;
  action: ProductImportConflictResolutionAction;
  targetProductId?: string;
};

export type ProductPrecheckStatus = 'safe_create' | 'existing_match_found' | 'conflict_found';

export type ProductPrecheckResult = {
  status: ProductPrecheckStatus;
  reason: string;
  candidateMatches: CandidateMatch[];
};

const LOCK_TTL_MINUTES = 30;

type ImportLockDocument = {
  _id: string;
  source: string;
  createdAt: Date;
  expiresAt: Date;
};

type ImportLockCollection = {
  findOne: (filter: { _id: string }) => Promise<ImportLockDocument | null>;
  deleteOne: (filter: { _id: string }) => Promise<unknown>;
  insertOne: (doc: ImportLockDocument) => Promise<unknown>;
};

type ImportDefaults = {
  dobavitelj: string;
  naslovDobavitelja: string;
};

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

function normalizeName(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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

function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function assertBoolean(value: unknown) {
  return typeof value === 'boolean';
}

function assertNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeExecutionMode(value: unknown) {
  if (value === 'simple' || value === 'per_unit' || value === 'measured') {
    return value;
  }
  return undefined;
}

function buildExternalKey(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

function hasProvidedField(product: NormalizedProduct, field: string) {
  return !product.providedFields || product.providedFields.includes(field);
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries) as T;
}

function getImportDefaults(source: string): ImportDefaults {
  const defaults = IMPORT_DEFAULTS[source as keyof typeof IMPORT_DEFAULTS];
  if (!defaults) {
    throw new Error(`Missing IMPORT_DEFAULTS for source="${source}".`);
  }
  const dobavitelj = normalizeText(defaults.dobavitelj);
  const naslovDobavitelja = normalizeText(defaults.naslovDobavitelja);
  if (!dobavitelj || !naslovDobavitelja) {
    throw new Error(`Missing IMPORT_DEFAULTS values for source="${source}".`);
  }
  return { dobavitelj, naslovDobavitelja };
}

function buildStrictBusinessKey(input: {
  ime: string;
  proizvajalec?: string;
  dobavitelj?: string;
  isService: boolean;
}) {
  const ime = normalizeName(input.ime);
  if (!ime) return '';
  const proizvajalec = normalizeName(input.proizvajalec);
  const dobavitelj = normalizeName(input.dobavitelj);
  return [ime, proizvajalec, dobavitelj, input.isService ? 'service' : 'product'].join('::');
}

function buildWeakNameKey(input: { ime: string }) {
  return normalizeName(input.ime);
}

function buildRowFingerprint(product: {
  source: string;
  externalId: string;
  ime: string;
  categorySlugs: string[];
  nabavnaCena: number;
  prodajnaCena: number;
  proizvajalec?: string;
  dobavitelj: string;
  isService: boolean;
}) {
  return JSON.stringify({
    source: normalizeText(product.source),
    externalId: normalizeText(product.externalId),
    ime: normalizeText(product.ime),
    categorySlugs: normalizeCategorySlugs(product.categorySlugs),
    nabavnaCena: product.nabavnaCena,
    prodajnaCena: product.prodajnaCena,
    proizvajalec: normalizeText(product.proizvajalec),
    dobavitelj: normalizeText(product.dobavitelj),
    isService: product.isService,
  });
}

function buildGeneratedExternalId(input: {
  ime: string;
  proizvajalec?: string;
  dobavitelj?: string;
  isService: boolean;
}) {
  const strictKey = buildStrictBusinessKey({
    ime: input.ime,
    proizvajalec: input.proizvajalec,
    dobavitelj: input.dobavitelj,
    isService: input.isService,
  });
  if (strictKey) {
    return `generated:${strictKey}`;
  }
  const weak = buildWeakNameKey({ ime: input.ime });
  if (!weak) return '';
  return `generated:${weak}::${input.isService ? 'service' : 'product'}`;
}

function validateAndNormalizeRow(
  product: unknown,
  index: number,
  source: string,
  seenKeys: Map<string, number>,
  defaults: ImportDefaults,
): { normalized: NormalizedProduct | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!isPlainObject(product)) {
    return {
      normalized: null,
      errors: [{ index, rowId: `row:${index}`, field: 'product', reason: 'must be an object' }],
    };
  }

  const sourceForRow = normalizeText(product.externalSource) || source;
  const providedFields = Array.isArray(product.__providedFields)
    ? product.__providedFields.filter((field): field is string => typeof field === 'string' && field.trim() !== '')
    : undefined;
  const imeRaw = normalizeText(product.ime);
  const dobaviteljRaw = normalizeText(product.dobavitelj) || defaults.dobavitelj;
  const proizvajalecRaw = normalizeText(product.proizvajalec) || undefined;
  const isServiceRaw = assertBoolean(product.isService) ? (product.isService as boolean) : false;

  let externalIdRaw = normalizeText(product.externalId);
  if (!externalIdRaw && source === 'dodatki') {
    externalIdRaw = buildGeneratedExternalId({
      ime: imeRaw,
      proizvajalec: proizvajalecRaw,
      dobavitelj: dobaviteljRaw,
      isService: isServiceRaw,
    });
  }
  const rowId = externalIdRaw ? `externalId:${externalIdRaw}` : `row:${index}`;

  if (!externalIdRaw) {
    errors.push({ index, rowId, field: 'externalId', reason: 'must be a non-empty string' });
  }

  const computedExternalKey = externalIdRaw ? buildExternalKey(sourceForRow, externalIdRaw) : '';

  if (typeof product.externalSource === 'string' && !sourceForRow) {
    errors.push({ index, rowId, field: 'externalSource', reason: 'must be a non-empty string' });
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
        reason: `duplicate in input (also at row ${existingIndex})`,
      });
    } else {
      seenKeys.set(computedExternalKey, index);
    }
  }

  const ime = imeRaw;
  if ((!providedFields || providedFields.includes('ime')) && !ime) {
    errors.push({ index, rowId, field: 'ime', reason: 'must be a non-empty string' });
  }

  const prodajnaCena = product.prodajnaCena;
  if (
    (!providedFields || providedFields.includes('prodajnaCena')) &&
    (!assertNumber(prodajnaCena) || (prodajnaCena as number) <= 0)
  ) {
    errors.push({ index, rowId, field: 'prodajnaCena', reason: 'must be a number > 0' });
  }

  const nabavnaCena = product.nabavnaCena;
  if (
    (!providedFields || providedFields.includes('nabavnaCena')) &&
    (!assertNumber(nabavnaCena) || (nabavnaCena as number) < 0)
  ) {
    errors.push({ index, rowId, field: 'nabavnaCena', reason: 'must be a number >= 0' });
  }

  const dobavitelj = dobaviteljRaw;
  if ((!providedFields || providedFields.includes('dobavitelj')) && !dobavitelj) {
    errors.push({ index, rowId, field: 'dobavitelj', reason: 'must be a non-empty string' });
  }

  const naslovDobavitelja = normalizeText(product.naslovDobavitelja) || defaults.naslovDobavitelja;
  if ((!providedFields || providedFields.includes('naslovDobavitelja')) && !naslovDobavitelja) {
    errors.push({ index, rowId, field: 'naslovDobavitelja', reason: 'must be a non-empty string' });
  }

  if ((!providedFields || providedFields.includes('isService')) && !assertBoolean(product.isService)) {
    errors.push({ index, rowId, field: 'isService', reason: 'must be a boolean' });
  }

  const categorySlugs = normalizeCategorySlugs(product.categorySlugs);
  if ((!providedFields || providedFields.includes('categorySlugs')) && categorySlugs.length === 0) {
    errors.push({ index, rowId, field: 'categorySlugs', reason: 'must be a non-empty array' });
  }

  if (errors.length > 0) {
    return { normalized: null, errors };
  }

  const normalized: NormalizedProduct = {
    source: sourceForRow,
    externalSource: sourceForRow,
    externalId: externalIdRaw,
    externalKey: computedExternalKey,
    ime,
    kategorija: normalizeText(product.kategorija) || undefined,
    categorySlugs,
    purchasePriceWithoutVat: assertNumber(product.purchasePriceWithoutVat)
      ? (product.purchasePriceWithoutVat as number)
      : undefined,
    nabavnaCena: assertNumber(nabavnaCena) ? (nabavnaCena as number) : 0,
    prodajnaCena: assertNumber(prodajnaCena) ? (prodajnaCena as number) : 0,
    kratekOpis: normalizeText(product.kratekOpis) || undefined,
    dolgOpis: normalizeText(product.dolgOpis) || undefined,
    povezavaDoSlike: normalizeUrl(product.povezavaDoSlike) || undefined,
    povezavaDoProdukta: normalizeUrl(product.povezavaDoProdukta) || undefined,
    proizvajalec: normalizeText(product.proizvajalec) || undefined,
    dobavitelj,
    naslovDobavitelja,
    casovnaNorma: normalizeText(product.casovnaNorma) || undefined,
    isService: product.isService as boolean,
    defaultExecutionMode: normalizeExecutionMode(product.defaultExecutionMode),
    defaultInstructionsTemplate: normalizeText(product.defaultInstructionsTemplate) || undefined,
    rowIndex: index,
    rowId,
    rowFingerprint: buildRowFingerprint({
      source,
      externalId: externalIdRaw,
      ime,
      categorySlugs,
      nabavnaCena: assertNumber(nabavnaCena) ? (nabavnaCena as number) : 0,
      prodajnaCena: assertNumber(prodajnaCena) ? (prodajnaCena as number) : 0,
      proizvajalec: proizvajalecRaw,
      dobavitelj,
      isService: product.isService as boolean,
    }),
    normalizedName: normalizeName(ime),
    strictBusinessKey: buildStrictBusinessKey({
      ime,
      proizvajalec: proizvajalecRaw,
      dobavitelj,
      isService: product.isService as boolean,
    }),
    weakNameKey: buildWeakNameKey({ ime }),
    providedFields,
  };

  return { normalized, errors };
}

function toPlanRowBase(product: NormalizedProduct): PlanRowBase {
  return {
    rowIndex: product.rowIndex,
    rowId: product.rowId,
    source: product.source,
    sourceRecordId: product.externalId,
    externalKey: product.externalKey,
    ime: product.ime,
    rowFingerprint: product.rowFingerprint,
  };
}

function mapSetFields(product: NormalizedProduct) {
  return removeUndefined({
    externalSource: hasProvidedField(product, 'externalSource') ? product.externalSource : undefined,
    externalId: hasProvidedField(product, 'externalId') ? product.externalId : undefined,
    externalKey: hasProvidedField(product, 'externalKey') ? product.externalKey : undefined,
    ime: hasProvidedField(product, 'ime') ? product.ime : undefined,
    kategorija: hasProvidedField(product, 'kategorija') ? product.kategorija : undefined,
    categorySlugs: hasProvidedField(product, 'categorySlugs') ? product.categorySlugs : undefined,
    purchasePriceWithoutVat: hasProvidedField(product, 'purchasePriceWithoutVat')
      ? product.purchasePriceWithoutVat ?? product.nabavnaCena
      : undefined,
    nabavnaCena: hasProvidedField(product, 'nabavnaCena') ? product.nabavnaCena : undefined,
    prodajnaCena: hasProvidedField(product, 'prodajnaCena') ? product.prodajnaCena : undefined,
    kratekOpis: hasProvidedField(product, 'kratekOpis') ? product.kratekOpis : undefined,
    dolgOpis: hasProvidedField(product, 'dolgOpis') ? product.dolgOpis : undefined,
    povezavaDoSlike: hasProvidedField(product, 'povezavaDoSlike') ? product.povezavaDoSlike : undefined,
    povezavaDoProdukta: hasProvidedField(product, 'povezavaDoProdukta') ? product.povezavaDoProdukta : undefined,
    proizvajalec: hasProvidedField(product, 'proizvajalec') ? product.proizvajalec : undefined,
    dobavitelj: hasProvidedField(product, 'dobavitelj') ? product.dobavitelj : undefined,
    naslovDobavitelja: hasProvidedField(product, 'naslovDobavitelja') ? product.naslovDobavitelja : undefined,
    casovnaNorma: hasProvidedField(product, 'casovnaNorma') ? product.casovnaNorma : undefined,
    isService: hasProvidedField(product, 'isService') ? product.isService : undefined,
    defaultExecutionMode: hasProvidedField(product, 'defaultExecutionMode') ? product.defaultExecutionMode : undefined,
    defaultInstructionsTemplate: hasProvidedField(product, 'defaultInstructionsTemplate')
      ? product.defaultInstructionsTemplate
      : undefined,
    isActive: product.providedFields ? undefined : true,
  });
}

function sameString(a: unknown, b: unknown) {
  return normalizeText(a) === normalizeText(b);
}

function sameStringArray(a: unknown, b: unknown) {
  const left = normalizeCategorySlugs(a);
  const right = normalizeCategorySlugs(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNumber(a: unknown, b: unknown) {
  const left = normalizeOptionalNumber(a);
  const right = normalizeOptionalNumber(b);
  return left === right;
}

function getChangedFields(product: NormalizedProduct, existing: ExistingProduct) {
  const changedFields: string[] = [];

  if (hasProvidedField(product, 'externalSource') && !sameString(existing.externalSource, product.externalSource)) changedFields.push('externalSource');
  if (hasProvidedField(product, 'externalId') && !sameString(existing.externalId, product.externalId)) changedFields.push('externalId');
  if (hasProvidedField(product, 'externalKey') && !sameString(existing.externalKey, product.externalKey)) changedFields.push('externalKey');
  if (hasProvidedField(product, 'ime') && !sameString(existing.ime, product.ime)) changedFields.push('ime');
  if (hasProvidedField(product, 'kategorija') && !sameString(existing.kategorija, product.kategorija)) changedFields.push('kategorija');
  if (hasProvidedField(product, 'categorySlugs') && !sameStringArray(existing.categorySlugs, product.categorySlugs)) changedFields.push('categorySlugs');
  if (hasProvidedField(product, 'purchasePriceWithoutVat') && !sameNumber(existing.purchasePriceWithoutVat, product.purchasePriceWithoutVat ?? product.nabavnaCena)) {
    changedFields.push('purchasePriceWithoutVat');
  }
  if (hasProvidedField(product, 'nabavnaCena') && !sameNumber(existing.nabavnaCena, product.nabavnaCena)) changedFields.push('nabavnaCena');
  if (hasProvidedField(product, 'prodajnaCena') && !sameNumber(existing.prodajnaCena, product.prodajnaCena)) changedFields.push('prodajnaCena');
  if (hasProvidedField(product, 'kratekOpis') && !sameString(existing.kratekOpis, product.kratekOpis)) changedFields.push('kratekOpis');
  if (hasProvidedField(product, 'dolgOpis') && !sameString(existing.dolgOpis, product.dolgOpis)) changedFields.push('dolgOpis');
  if (hasProvidedField(product, 'povezavaDoSlike') && !sameString(existing.povezavaDoSlike, product.povezavaDoSlike)) changedFields.push('povezavaDoSlike');
  if (hasProvidedField(product, 'povezavaDoProdukta') && !sameString(existing.povezavaDoProdukta, product.povezavaDoProdukta)) changedFields.push('povezavaDoProdukta');
  if (hasProvidedField(product, 'proizvajalec') && !sameString(existing.proizvajalec, product.proizvajalec)) changedFields.push('proizvajalec');
  if (hasProvidedField(product, 'dobavitelj') && !sameString(existing.dobavitelj, product.dobavitelj)) changedFields.push('dobavitelj');
  if (hasProvidedField(product, 'naslovDobavitelja') && !sameString(existing.naslovDobavitelja, product.naslovDobavitelja)) changedFields.push('naslovDobavitelja');
  if (hasProvidedField(product, 'casovnaNorma') && !sameString(existing.casovnaNorma, product.casovnaNorma)) changedFields.push('casovnaNorma');
  if (hasProvidedField(product, 'isService') && Boolean(existing.isService) !== product.isService) changedFields.push('isService');
  if (hasProvidedField(product, 'defaultExecutionMode') && !sameString(existing.defaultExecutionMode, product.defaultExecutionMode)) changedFields.push('defaultExecutionMode');
  if (hasProvidedField(product, 'defaultInstructionsTemplate') && !sameString(existing.defaultInstructionsTemplate, product.defaultInstructionsTemplate)) changedFields.push('defaultInstructionsTemplate');
  if (!product.providedFields && existing.isActive !== true) changedFields.push('isActive');

  return changedFields;
}

function summarizePlan(plan: Omit<ImportPlan, 'summary'>): ImportPlanSummary {
  return {
    totalSourceRows:
      plan.toCreate.length +
      plan.toUpdate.length +
      plan.toSkip.length +
      plan.conflicts.length +
      plan.invalidRows.length,
    matchedRows: plan.toUpdate.length + plan.toSkip.length,
    toCreateCount: plan.toCreate.length,
    toUpdateCount: plan.toUpdate.length,
    toSkipCount: plan.toSkip.length,
    conflictCount: plan.conflicts.length,
    invalidCount: plan.invalidRows.length,
  };
}

function getMissingCreateFields(row: NormalizedProduct): ValidationError[] {
  if (!row.providedFields) return [];
  const requiredFields = [
    'ime',
    'categorySlugs',
    'nabavnaCena',
    'prodajnaCena',
    'dobavitelj',
    'naslovDobavitelja',
    'isService',
  ];
  return requiredFields
    .filter((field) => !row.providedFields?.includes(field))
    .map((field) => ({
      index: row.rowIndex,
      rowId: row.rowId,
      field,
      reason: 'is required when creating a new product',
    }));
}

function buildInvalidCreateRow(row: NormalizedProduct): ImportInvalidRow | null {
  const errors = getMissingCreateFields(row);
  if (errors.length === 0) return null;
  return {
    ...toPlanRowBase(row),
    action: 'invalid',
    errors,
  };
}

async function loadExistingProducts() {
  const fields =
    '_id externalSource externalId externalKey ime kategorija categorySlugs purchasePriceWithoutVat nabavnaCena prodajnaCena kratekOpis dolgOpis povezavaDoSlike povezavaDoProdukta proizvajalec dobavitelj naslovDobavitelja casovnaNorma isService defaultExecutionMode defaultInstructionsTemplate isActive mergedIntoProductId status';

  return (await ProductModel.find().select(fields).lean()) as ExistingProduct[];
}

function buildIndexes(products: ExistingProduct[]) {
  const byExternalKey = new Map<string, ExistingProduct[]>();
  const bySourceIdentifier = new Map<string, ExistingProduct[]>();
  const byStrictBusinessKey = new Map<string, ExistingProduct[]>();
  const byWeakName = new Map<string, ExistingProduct[]>();

  for (const product of products) {
    const externalKey = normalizeText(product.externalKey);
    if (externalKey) {
      const existing = byExternalKey.get(externalKey) ?? [];
      existing.push(product);
      byExternalKey.set(externalKey, existing);
    }

    const source = normalizeText(product.externalSource);
    const externalId = normalizeText(product.externalId);
    if (source && externalId) {
      const key = `${source}::${externalId}`;
      const existing = bySourceIdentifier.get(key) ?? [];
      existing.push(product);
      bySourceIdentifier.set(key, existing);
    }

    if (product.isActive === false) {
      continue;
    }

    const strictBusinessKey = buildStrictBusinessKey({
      ime: normalizeText(product.ime),
      proizvajalec: normalizeText(product.proizvajalec) || undefined,
      dobavitelj: normalizeText(product.dobavitelj) || undefined,
      isService: Boolean(product.isService),
    });
    if (strictBusinessKey) {
      const existing = byStrictBusinessKey.get(strictBusinessKey) ?? [];
      existing.push(product);
      byStrictBusinessKey.set(strictBusinessKey, existing);
    }

    const weakNameKey = buildWeakNameKey({ ime: normalizeText(product.ime) });
    if (weakNameKey) {
      const existing = byWeakName.get(weakNameKey) ?? [];
      existing.push(product);
      byWeakName.set(weakNameKey, existing);
    }
  }

  return { byExternalKey, bySourceIdentifier, byStrictBusinessKey, byWeakName };
}

function buildProductIdIndex(products: ExistingProduct[]) {
  return new Map(products.map((product) => [String(product._id), product]));
}

function resolveMergedMatch(
  product: ExistingProduct,
  byId: Map<string, ExistingProduct>,
): ExistingProduct {
  if (product.isActive !== false || !product.mergedIntoProductId) {
    return product;
  }

  const target = byId.get(String(product.mergedIntoProductId));
  if (!target) {
    return product;
  }

  if (target.isActive === false) {
    return target;
  }

  return target;
}

function buildIncomingProductData(row: NormalizedProduct): ImportIncomingProductData {
  return {
    ime: row.ime,
    proizvajalec: row.proizvajalec ?? '',
    dobavitelj: row.dobavitelj,
    categorySlugs: row.categorySlugs,
    nabavnaCena: row.nabavnaCena,
    prodajnaCena: row.prodajnaCena,
    isService: row.isService,
  };
}

function buildCandidateMatches(row: NormalizedProduct, products: ExistingProduct[], reason: string): CandidateMatch[] {
  const seen = new Set<string>();

  return products
    .map((product) => {
      const productId = String(product._id);
      if (seen.has(productId)) return null;
      seen.add(productId);

      let score = 0;
      const explanationParts: string[] = [];

      if (normalizeText(product.externalKey) && normalizeText(product.externalKey) === row.externalKey) {
        score += 120;
        explanationParts.push('exact external key match');
      }

      if (
        normalizeText(product.externalSource) === row.externalSource &&
        normalizeText(product.externalId) === row.externalId
      ) {
        score += 110;
        explanationParts.push('exact source identifier match');
      }

      const strictKey = buildStrictBusinessKey({
        ime: normalizeText(product.ime),
        proizvajalec: normalizeText(product.proizvajalec) || undefined,
        dobavitelj: normalizeText(product.dobavitelj) || undefined,
        isService: Boolean(product.isService),
      });
      if (strictKey && strictKey === row.strictBusinessKey) {
        score += 90;
        explanationParts.push('strict business fields match');
      }

      if (buildWeakNameKey({ ime: normalizeText(product.ime) }) === row.weakNameKey) {
        score += 60;
        explanationParts.push('same normalized name');
      }

      if (normalizeName(product.proizvajalec) && normalizeName(product.proizvajalec) === normalizeName(row.proizvajalec)) {
        score += 20;
        explanationParts.push('same manufacturer');
      }

      if (normalizeName(product.dobavitelj) && normalizeName(product.dobavitelj) === normalizeName(row.dobavitelj)) {
        score += 20;
        explanationParts.push('same supplier');
      }

      if (Boolean(product.isService) === row.isService) {
        score += 10;
        explanationParts.push(row.isService ? 'both are services' : 'both are products');
      }

      const overlapCount = normalizeCategorySlugs(product.categorySlugs).filter((slug) =>
        row.categorySlugs.includes(slug),
      ).length;
      if (overlapCount > 0) {
        score += Math.min(overlapCount * 5, 15);
        explanationParts.push(`category overlap (${overlapCount})`);
      }

      const matchExplanation = explanationParts.length > 0 ? explanationParts.join(', ') : reason;

      const candidate: CandidateMatch = {
        productId,
        ime: normalizeText(product.ime),
        proizvajalec: normalizeText(product.proizvajalec),
        dobavitelj: normalizeText(product.dobavitelj),
        externalKey: normalizeText(product.externalKey),
        source: normalizeText(product.externalSource),
        isService: Boolean(product.isService),
        nabavnaCena: normalizeOptionalNumber(product.nabavnaCena),
        prodajnaCena: normalizeOptionalNumber(product.prodajnaCena),
        matchExplanation,
      };

      return {
        candidate,
        score,
        sortName: normalizeName(product.ime),
      };
    })
    .filter((item): item is { candidate: CandidateMatch; score: number; sortName: string } => Boolean(item))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.sortName.localeCompare(b.sortName);
    })
    .slice(0, 3)
    .map((item) => item.candidate);
}

function buildConflictRow(
  row: NormalizedProduct,
  reason: string,
  candidates: ExistingProduct[],
): ImportConflictRow {
  return {
    ...toPlanRowBase(row),
    action: 'conflict',
    reason,
    incoming: buildIncomingProductData(row),
    candidateMatches: buildCandidateMatches(row, candidates, reason),
  };
}

function buildManualCandidate(input: {
  ime: string;
  categorySlugs: string[];
  isService: boolean;
  nabavnaCena: number;
  prodajnaCena: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  povezavaDoProdukta?: string;
  proizvajalec?: string;
  dobavitelj?: string;
  naslovDobavitelja?: string;
  casovnaNorma?: string;
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
}): NormalizedProduct {
  const source = normalizeText(input.externalSource) || 'manual';
  const ime = normalizeText(input.ime);
  const dobavitelj = normalizeText(input.dobavitelj);
  const externalId = normalizeText(input.externalId);
  const externalKey =
    normalizeText(input.externalKey) || (source && externalId ? buildExternalKey(source, externalId) : '');

  return {
    source,
    externalSource: source,
    externalId,
    externalKey,
    ime,
    kategorija: '',
    categorySlugs: normalizeCategorySlugs(input.categorySlugs),
    purchasePriceWithoutVat: input.nabavnaCena,
    nabavnaCena: input.nabavnaCena,
    prodajnaCena: input.prodajnaCena,
    kratekOpis: normalizeText(input.kratekOpis) || undefined,
    dolgOpis: normalizeText(input.dolgOpis) || undefined,
    povezavaDoSlike: normalizeUrl(input.povezavaDoSlike) || undefined,
    povezavaDoProdukta: normalizeUrl(input.povezavaDoProdukta) || undefined,
    proizvajalec: normalizeText(input.proizvajalec) || undefined,
    dobavitelj,
    naslovDobavitelja: normalizeText(input.naslovDobavitelja) || undefined,
    casovnaNorma: normalizeText(input.casovnaNorma) || undefined,
    isService: Boolean(input.isService),
    rowIndex: 0,
    rowId: externalId ? `externalId:${externalId}` : 'manual:0',
    rowFingerprint: buildRowFingerprint({
      source,
      externalId,
      ime,
      categorySlugs: normalizeCategorySlugs(input.categorySlugs),
      nabavnaCena: input.nabavnaCena,
      prodajnaCena: input.prodajnaCena,
      proizvajalec: normalizeText(input.proizvajalec) || undefined,
      dobavitelj,
      isService: Boolean(input.isService),
    }),
    normalizedName: normalizeName(ime),
    strictBusinessKey: buildStrictBusinessKey({
      ime,
      proizvajalec: normalizeText(input.proizvajalec) || undefined,
      dobavitelj,
      isService: Boolean(input.isService),
    }),
    weakNameKey: buildWeakNameKey({ ime }),
  };
}

function classifyManualCandidate(
  row: NormalizedProduct,
  indexes: ReturnType<typeof buildIndexes>,
  productsById: Map<string, ExistingProduct>,
): ProductPrecheckResult {
  const externalKeyMatches = row.externalKey ? indexes.byExternalKey.get(row.externalKey) ?? [] : [];
  if (externalKeyMatches.length === 1) {
    const resolved = resolveMergedMatch(externalKeyMatches[0], productsById);
    return {
      status: 'existing_match_found',
      reason: 'exact external key match found',
      candidateMatches: buildCandidateMatches(row, [resolved], 'exact external key match'),
    };
  }
  if (externalKeyMatches.length > 1) {
    return {
      status: 'conflict_found',
      reason: 'multiple products share the same external key',
      candidateMatches: buildCandidateMatches(row, externalKeyMatches, 'multiple products share the same external key'),
    };
  }

  const sourceIdentifierKey =
    row.externalSource && row.externalId ? `${row.externalSource}::${row.externalId}` : '';
  const sourceIdentifierMatches = sourceIdentifierKey ? indexes.bySourceIdentifier.get(sourceIdentifierKey) ?? [] : [];
  if (sourceIdentifierMatches.length === 1) {
    const resolved = resolveMergedMatch(sourceIdentifierMatches[0], productsById);
    return {
      status: 'existing_match_found',
      reason: 'exact source identifier match found',
      candidateMatches: buildCandidateMatches(row, [resolved], 'exact source identifier match'),
    };
  }
  if (sourceIdentifierMatches.length > 1) {
    return {
      status: 'conflict_found',
      reason: 'multiple products share the same source identifier',
      candidateMatches: buildCandidateMatches(row, sourceIdentifierMatches, 'multiple products share the same source identifier'),
    };
  }

  const strictBusinessMatches = row.strictBusinessKey
    ? indexes.byStrictBusinessKey.get(row.strictBusinessKey) ?? []
    : [];
  if (strictBusinessMatches.length === 1) {
    return {
      status: 'existing_match_found',
      reason: 'strict business match found',
      candidateMatches: buildCandidateMatches(row, strictBusinessMatches, 'strict business match'),
    };
  }
  if (strictBusinessMatches.length > 1) {
    return {
      status: 'conflict_found',
      reason: 'ambiguous strict business match',
      candidateMatches: buildCandidateMatches(row, strictBusinessMatches, 'ambiguous strict business match'),
    };
  }

  const weakNameMatches = row.weakNameKey ? indexes.byWeakName.get(row.weakNameKey) ?? [] : [];
  if (weakNameMatches.length > 0) {
    return {
      status: 'conflict_found',
      reason: 'possible name-only match; manual review required',
      candidateMatches: buildCandidateMatches(row, weakNameMatches, 'possible name-only match'),
    };
  }

  return {
    status: 'safe_create',
    reason: 'no existing product matched current identity rules',
    candidateMatches: [],
  };
}

async function loadStoredConflictResolutions(source: string) {
  const rows = await ProductImportConflictResolutionModel.find({ source }).lean();
  return new Map<string, StoredConflictResolution>(
    rows.map((row) => [
      normalizeText(row.externalKey),
      {
        source: normalizeText(row.source),
        externalId: normalizeText(row.externalId),
        externalKey: normalizeText(row.externalKey),
        rowFingerprint: normalizeText(row.rowFingerprint),
        action: row.action,
        targetProductId: row.targetProductId ? String(row.targetProductId) : undefined,
      },
    ]),
  );
}

function resolutionMatchesRow(
  resolution: StoredConflictResolution | undefined,
  row: NormalizedProduct,
) {
  return Boolean(
    resolution &&
      resolution.externalKey === row.externalKey &&
      resolution.externalId === row.externalId &&
      resolution.rowFingerprint === row.rowFingerprint,
  );
}

function resolveRowWithStoredDecision(
  row: NormalizedProduct,
  resolution: StoredConflictResolution,
  existingProducts: ExistingProduct[],
): ImportCreateRow | ImportUpdateRow | ImportSkipRow | ImportConflictRow {
  const base = toPlanRowBase(row);

  if (resolution.action === 'skip') {
    return {
      ...base,
      action: 'skip',
      matchType: 'resolution_skip',
    };
  }

  if (resolution.action === 'create_new') {
    return {
      ...base,
      action: 'create',
      matchType: 'new_product',
    };
  }

  const target = existingProducts.find((product) => String(product._id) === resolution.targetProductId);
  if (!target) {
    return buildConflictRow(row, 'saved resolution target no longer exists', existingProducts);
  }

  const changedFields = getChangedFields(row, target);
  if (changedFields.length === 0) {
    return {
      ...base,
      action: 'skip',
      productId: String(target._id),
      matchType: 'resolution_link',
    };
  }

  return {
    ...base,
    action: 'update',
    productId: String(target._id),
    matchType: 'resolution_link',
    changedFields,
  };
}

async function analyzeProducts(source: string, items: unknown[]): Promise<{ plan: ImportPlan; normalizedRows: NormalizedProduct[] }> {
  const defaults = getImportDefaults(source);
  const seenKeys = new Map<string, number>();
  const normalizedRows: NormalizedProduct[] = [];
  const invalidRows: ImportInvalidRow[] = [];

  items.forEach((product, index) => {
    const { normalized, errors } = validateAndNormalizeRow(product, index, source, seenKeys, defaults);
    if (!normalized) {
      invalidRows.push({
        ...toPlanRowBase({
          source,
          externalSource: source,
          externalId: normalizeText((product as Record<string, unknown> | undefined)?.externalId),
          externalKey: normalizeText((product as Record<string, unknown> | undefined)?.externalKey),
          ime: normalizeText((product as Record<string, unknown> | undefined)?.ime),
          categorySlugs: [],
          nabavnaCena: 0,
          prodajnaCena: 0,
          dobavitelj: defaults.dobavitelj,
          isService: false,
          rowIndex: index,
          rowId: errors[0]?.rowId ?? `row:${index}`,
          rowFingerprint: '',
          normalizedName: normalizeName((product as Record<string, unknown> | undefined)?.ime),
          strictBusinessKey: '',
          weakNameKey: normalizeName((product as Record<string, unknown> | undefined)?.ime),
        }),
        action: 'invalid',
        errors,
      });
      return;
    }
    normalizedRows.push(normalized);
  });

  const existingProducts = await loadExistingProducts();
  const indexes = buildIndexes(existingProducts);
  const productsById = buildProductIdIndex(existingProducts);
  const storedResolutions = await loadStoredConflictResolutions(source);

  const inputBusinessKeyCounts = new Map<string, number>();
  const inputWeakNameCounts = new Map<string, number>();
  normalizedRows.forEach((row) => {
    if (row.strictBusinessKey) {
      inputBusinessKeyCounts.set(row.strictBusinessKey, (inputBusinessKeyCounts.get(row.strictBusinessKey) ?? 0) + 1);
    }
    if (row.weakNameKey) {
      inputWeakNameCounts.set(row.weakNameKey, (inputWeakNameCounts.get(row.weakNameKey) ?? 0) + 1);
    }
  });

  const toCreate: ImportCreateRow[] = [];
  const toUpdate: ImportUpdateRow[] = [];
  const toSkip: ImportSkipRow[] = [];
  const conflicts: ImportConflictRow[] = [];

  for (const row of normalizedRows) {
    const base = toPlanRowBase(row);

    const externalKeyMatches = indexes.byExternalKey.get(row.externalKey) ?? [];
    if (externalKeyMatches.length > 1) {
      conflicts.push(buildConflictRow(row, 'multiple products share the same externalKey', externalKeyMatches));
      continue;
    }
    if (externalKeyMatches.length === 1) {
      const existing = resolveMergedMatch(externalKeyMatches[0], productsById);
      const changedFields = getChangedFields(row, existing);
      if (changedFields.length === 0) {
        toSkip.push({
          ...base,
          action: 'skip',
          productId: String(existing._id),
          matchType: 'external_key',
        });
      } else {
        toUpdate.push({
          ...base,
          action: 'update',
          productId: String(existing._id),
          matchType: 'external_key',
          changedFields,
        });
      }
      continue;
    }

    const sourceIdentifierKey = `${row.externalSource}::${row.externalId}`;
    const sourceIdentifierMatches = indexes.bySourceIdentifier.get(sourceIdentifierKey) ?? [];
    if (sourceIdentifierMatches.length > 1) {
      conflicts.push(buildConflictRow(row, 'multiple products share the same source identifier', sourceIdentifierMatches));
      continue;
    }
    if (sourceIdentifierMatches.length === 1) {
      const existing = resolveMergedMatch(sourceIdentifierMatches[0], productsById);
      const changedFields = getChangedFields(row, existing);
      if (changedFields.length === 0) {
        toSkip.push({
          ...base,
          action: 'skip',
          productId: String(existing._id),
          matchType: 'source_identifier',
        });
      } else {
        toUpdate.push({
          ...base,
          action: 'update',
          productId: String(existing._id),
          matchType: 'source_identifier',
          changedFields,
        });
      }
      continue;
    }

    const strictBusinessMatches = row.strictBusinessKey
      ? indexes.byStrictBusinessKey.get(row.strictBusinessKey) ?? []
      : [];
    if (strictBusinessMatches.length > 1) {
      conflicts.push(buildConflictRow(row, 'ambiguous strict business match', strictBusinessMatches));
      continue;
    }
    if (strictBusinessMatches.length === 1) {
      const existing = strictBusinessMatches[0];
      const changedFields = getChangedFields(row, existing);
      if (changedFields.length === 0) {
        toSkip.push({
          ...base,
          action: 'skip',
          productId: String(existing._id),
          matchType: 'strict_business_match',
        });
      } else {
        toUpdate.push({
          ...base,
          action: 'update',
          productId: String(existing._id),
          matchType: 'strict_business_match',
          changedFields,
        });
      }
      continue;
    }

    const storedResolution = storedResolutions.get(row.externalKey);
    if (resolutionMatchesRow(storedResolution, row)) {
      const resolved = resolveRowWithStoredDecision(row, storedResolution, existingProducts);
      if (resolved.action === 'create') {
        const invalidCreate = buildInvalidCreateRow(row);
        if (invalidCreate) {
          invalidRows.push(invalidCreate);
        } else {
          toCreate.push(resolved);
        }
      } else if (resolved.action === 'update') {
        toUpdate.push(resolved);
      } else if (resolved.action === 'skip') {
        toSkip.push(resolved);
      } else {
        conflicts.push(resolved);
      }
      continue;
    }

    if (row.strictBusinessKey && (inputBusinessKeyCounts.get(row.strictBusinessKey) ?? 0) > 1) {
      conflicts.push(buildConflictRow(row, 'multiple source rows share the same strict business match key', []));
      continue;
    }

    const weakNameMatches = row.weakNameKey ? indexes.byWeakName.get(row.weakNameKey) ?? [] : [];
    if (weakNameMatches.length > 0 || (row.weakNameKey && (inputWeakNameCounts.get(row.weakNameKey) ?? 0) > 1)) {
      conflicts.push(buildConflictRow(row, 'possible name-only match; manual review required', weakNameMatches));
      continue;
    }

    const invalidCreate = buildInvalidCreateRow(row);
    if (invalidCreate) {
      invalidRows.push(invalidCreate);
      continue;
    }

    toCreate.push({
      ...base,
      action: 'create',
      matchType: 'new_product',
    });
  }

  const planBase = {
    source,
    toCreate,
    toUpdate,
    toSkip,
    conflicts,
    invalidRows,
  };

  const plan: ImportPlan = {
    ...planBase,
    summary: summarizePlan(planBase),
  };

  return { plan, normalizedRows };
}

async function acquireLock(source: string) {
  const collection = mongoose.connection.collection('import_locks') as unknown as ImportLockCollection;
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
  const collection = mongoose.connection.collection('import_locks') as unknown as ImportLockCollection;
  const lockId = `product-import:${source}`;
  await collection.deleteOne({ _id: lockId });
}

export async function analyzeProductImportFromItems({
  source,
  items,
}: {
  source: string;
  items: unknown[];
}): Promise<ImportPlan> {
  const { plan } = await analyzeProducts(source, items);
  return plan;
}

export async function resolveProductImportConflict(
  request: ResolveImportConflictRequest,
) {
  const source = normalizeText(request.source);
  const externalKey = normalizeText(request.externalKey);
  const externalId = normalizeText(request.sourceRecordId);
  const rowFingerprint = normalizeText(request.rowFingerprint);

  if (!source) {
    throw new Error('Source is required.');
  }
  if (!externalKey) {
    throw new Error('External key is required.');
  }
  if (!externalId) {
    throw new Error('Source record id is required.');
  }
  if (!rowFingerprint) {
    throw new Error('Row fingerprint is required.');
  }

  let targetProductId: mongoose.Types.ObjectId | undefined;
  if (request.action === 'link_existing') {
    if (!request.targetProductId || !mongoose.isValidObjectId(request.targetProductId)) {
      throw new Error('Valid targetProductId is required for link_existing.');
    }
    const target = await ProductModel.findById(request.targetProductId).select({ _id: 1 }).lean();
    if (!target) {
      throw new Error('Target product does not exist.');
    }
    targetProductId = new mongoose.Types.ObjectId(request.targetProductId);
  }

  await ProductImportConflictResolutionModel.findOneAndUpdate(
    { source, externalKey },
    {
      $set: {
        source,
        externalId,
        externalKey,
        rowFingerprint,
        action: request.action,
        targetProductId,
      },
      $unset: request.action === 'link_existing' ? {} : { targetProductId: '' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    source,
    externalKey,
    sourceRecordId: externalId,
    rowFingerprint,
    action: request.action,
    targetProductId: targetProductId ? String(targetProductId) : undefined,
  };
}

export async function precheckProductCandidate(input: {
  ime: string;
  categorySlugs: string[];
  isService?: boolean;
  nabavnaCena?: number;
  prodajnaCena?: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  povezavaDoProdukta?: string;
  proizvajalec?: string;
  dobavitelj?: string;
  naslovDobavitelja?: string;
  casovnaNorma?: string;
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
}): Promise<ProductPrecheckResult> {
  const row = buildManualCandidate({
    ime: input.ime,
    categorySlugs: input.categorySlugs,
    isService: Boolean(input.isService),
    nabavnaCena: normalizeOptionalNumber(input.nabavnaCena) ?? 0,
    prodajnaCena: normalizeOptionalNumber(input.prodajnaCena) ?? 0,
    kratekOpis: input.kratekOpis,
    dolgOpis: input.dolgOpis,
    povezavaDoSlike: input.povezavaDoSlike,
    povezavaDoProdukta: input.povezavaDoProdukta,
    proizvajalec: input.proizvajalec,
    dobavitelj: input.dobavitelj,
    naslovDobavitelja: input.naslovDobavitelja,
    casovnaNorma: input.casovnaNorma,
    externalSource: input.externalSource,
    externalId: input.externalId,
    externalKey: input.externalKey,
  });

  if (!row.ime || row.categorySlugs.length === 0) {
    throw new Error('Ime in vsaj ena kategorija sta obvezni.');
  }

  const existingProducts = await loadExistingProducts();
  const indexes = buildIndexes(existingProducts);
  const productsById = buildProductIdIndex(existingProducts);
  return classifyManualCandidate(row, indexes, productsById);
}

export async function applyProductImportFromItems({
  source,
  items,
}: {
  source: string;
  items: unknown[];
}): Promise<AppliedImportPlan> {
  const lockAcquired = await acquireLock(source);
  if (!lockAcquired) {
    throw new Error(`Import lock already held for source "${source}". Aborting.`);
  }

  try {
    const { plan, normalizedRows } = await analyzeProducts(source, items);
    const rowMap = new Map(normalizedRows.map((row) => [row.externalKey, row]));

    let createdCount = 0;
    let updatedCount = 0;

    for (const row of plan.toUpdate) {
      const normalized = rowMap.get(row.externalKey);
      if (!normalized) continue;
      await ProductModel.updateOne(
        { _id: row.productId },
        {
          $set: mapSetFields(normalized),
          $unset: { mergedInto: '' },
        },
      );
      updatedCount += 1;
    }

    for (const row of plan.toCreate) {
      const normalized = rowMap.get(row.externalKey);
      if (!normalized) continue;
      await ProductModel.create(mapSetFields(normalized));
      createdCount += 1;
    }

    const applied: ImportApplySummary = {
      ...plan.summary,
      createdCount,
      updatedCount,
      skippedCount: plan.toSkip.length,
      excludedConflictCount: plan.conflicts.length,
      excludedInvalidCount: plan.invalidRows.length,
    };

    return {
      ...plan,
      applied,
    };
  } finally {
    await releaseLock(source).catch(() => undefined);
  }
}

export async function syncProductsFromItems({ source, items }: SyncProductsRequest): Promise<SyncReport> {
  const applied = await applyProductImportFromItems({ source, items });
  return {
    source,
    total: applied.summary.totalSourceRows,
    created: applied.applied.createdCount,
    updated: applied.applied.updatedCount,
    reactivated: 0,
    wouldDeactivate: 0,
    deactivated: 0,
  };
}

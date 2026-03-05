import fs from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import { IMPORT_DEFAULTS } from '../modules/cenik/sync/importDefaults';

type SourceName = 'aa_api' | 'services_sheet';

type SourceConfig = {
  source: SourceName;
  inputPath: string;
  expectedIsService: boolean;
};

type SnapshotInputRow = Record<string, unknown>;

type SnapshotRow = {
  source: SourceName;
  externalId: string;
  externalKey: string;
  ime: string;
  normName: string;
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
  naslovDobavitelja: string;
  casovnaNorma?: string;
  isService: boolean;
};

type ProductLean = {
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
  isActive?: boolean;
  updatedAt?: Date;
  createdAt?: Date;
};

type ReconcileAction =
  | 'updated_by_key'
  | 'deduped_by_key'
  | 'remapped_by_name'
  | 'deduped_by_name'
  | 'created';

type MergeRecord = {
  source: SourceName;
  reason: 'duplicate_by_key' | 'duplicate_by_name';
  snapshotExternalKey: string;
  canonicalId: string;
  mergedIds: string[];
};

type CreateRecord = {
  source: SourceName;
  snapshotExternalKey: string;
  name: string;
};

type ConflictRecord = {
  source: SourceName;
  kind: 'snapshot_name_conflict';
  normName: string;
  snapshotExternalKeys: string[];
};

type SourceReport = {
  source: SourceName;
  totalSnapshot: number;
  conflictsCount: number;
  duplicatesFound: number;
  remappedByNameCount: number;
  createdCount: number;
  updatedCount: number;
  reactivatedCount: number;
  missingAfter: number;
  actions: ReconcileAction[];
  conflicts: ConflictRecord[];
  merges: MergeRecord[];
  creates: CreateRecord[];
};

const SOURCE_CONFIGS: SourceConfig[] = [
  {
    source: 'aa_api',
    inputPath: path.resolve(__dirname, '..', 'data', 'cenik', 'aa_api_produkti.json'),
    expectedIsService: false,
  },
  {
    source: 'services_sheet',
    inputPath: path.resolve(__dirname, '..', 'data', 'cenik', 'custom_storitve.json'),
    expectedIsService: true,
  },
];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeName(value: unknown) {
  const base = normalizeText(value);
  if (!base) return '';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCategorySlugs(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const clean = normalizeText(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function asNonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return parsed;
}

function asPositiveNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return parsed;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  return Object.fromEntries(entries) as T;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    confirm: args.includes('--confirm'),
  };
}

function buildExternalKey(source: SourceName, externalId: string) {
  return `${source}:${externalId}`;
}

function parseSnapshot(config: SourceConfig): SnapshotRow[] {
  if (!fs.existsSync(config.inputPath)) {
    throw new Error(`Snapshot not found: ${config.inputPath}`);
  }

  const raw = fs.readFileSync(config.inputPath, 'utf8');
  const parsed = JSON.parse(raw) as { products?: unknown };
  const products = Array.isArray(parsed?.products) ? parsed.products : null;
  if (!products) {
    throw new Error(`Invalid snapshot format for source=${config.source}. Expected { products: [] }`);
  }

  const defaults = IMPORT_DEFAULTS[config.source];
  const errors: string[] = [];
  const rows: SnapshotRow[] = [];
  const seenKeys = new Set<string>();

  products.forEach((entry, index) => {
    const row = entry as SnapshotInputRow;
    const rowLabel = `[${config.source}][${index}]`;

    const externalId = normalizeText(row.externalId);
    const externalKey = normalizeText(row.externalKey);
    const expectedExternalKey = externalId ? buildExternalKey(config.source, externalId) : '';
    if (!externalId) {
      errors.push(`${rowLabel} externalId missing`);
      return;
    }
    if (externalKey !== expectedExternalKey) {
      errors.push(`${rowLabel} externalKey mismatch: got="${externalKey}" expected="${expectedExternalKey}"`);
      return;
    }
    if (seenKeys.has(externalKey)) {
      errors.push(`${rowLabel} duplicate externalKey in snapshot: ${externalKey}`);
      return;
    }
    seenKeys.add(externalKey);

    const ime = normalizeText(row.ime);
    const normName = normalizeName(ime);
    if (!ime || !normName) {
      errors.push(`${rowLabel} ime missing`);
      return;
    }

    const categorySlugs = normalizeCategorySlugs(row.categorySlugs);
    if (categorySlugs.length === 0) {
      errors.push(`${rowLabel} categorySlugs missing/empty`);
      return;
    }

    const nabavnaCena = asNonNegativeNumber(row.nabavnaCena);
    const prodajnaCena = asPositiveNumber(row.prodajnaCena);
    if (nabavnaCena === null) {
      errors.push(`${rowLabel} nabavnaCena invalid`);
      return;
    }
    if (prodajnaCena === null) {
      errors.push(`${rowLabel} prodajnaCena invalid`);
      return;
    }

    const rawPurchase = row.purchasePriceWithoutVat;
    const purchasePriceWithoutVat =
      rawPurchase === undefined || rawPurchase === null ? undefined : asNonNegativeNumber(rawPurchase);
    if (rawPurchase !== undefined && rawPurchase !== null && purchasePriceWithoutVat === null) {
      errors.push(`${rowLabel} purchasePriceWithoutVat invalid`);
      return;
    }

    const isService = typeof row.isService === 'boolean' ? row.isService : null;
    if (isService === null || isService !== config.expectedIsService) {
      errors.push(`${rowLabel} isService invalid for source ${config.source}`);
      return;
    }

    rows.push({
      source: config.source,
      externalId,
      externalKey,
      ime,
      normName,
      kategorija: normalizeText(row.kategorija) || undefined,
      categorySlugs,
      purchasePriceWithoutVat: purchasePriceWithoutVat ?? undefined,
      nabavnaCena,
      prodajnaCena,
      kratekOpis: normalizeText(row.kratekOpis) || undefined,
      dolgOpis: normalizeText(row.dolgOpis) || undefined,
      povezavaDoSlike: normalizeUrl(row.povezavaDoSlike) || undefined,
      povezavaDoProdukta: normalizeUrl(row.povezavaDoProdukta) || undefined,
      proizvajalec: normalizeText(row.proizvajalec) || undefined,
      dobavitelj: normalizeText(row.dobavitelj) || defaults.dobavitelj,
      naslovDobavitelja: normalizeText(row.naslovDobavitelja) || defaults.naslovDobavitelja,
      casovnaNorma: normalizeText(row.casovnaNorma) || undefined,
      isService,
    });
  });

  if (errors.length > 0) {
    const limit = errors.slice(0, 50);
    const suffix = errors.length > 50 ? `\n...and ${errors.length - 50} more` : '';
    throw new Error(`Snapshot validation failed for source=${config.source}:\n${limit.join('\n')}${suffix}`);
  }

  return rows;
}

async function loadCandidates(config: SourceConfig, normNameSet: Set<string>) {
  const selectedFields =
    '_id externalSource externalId externalKey ime kategorija categorySlugs purchasePriceWithoutVat nabavnaCena prodajnaCena kratekOpis dolgOpis povezavaDoSlike povezavaDoProdukta proizvajalec dobavitelj naslovDobavitelja casovnaNorma isService isActive updatedAt createdAt';

  const sourceDocs = (await ProductModel.find({ externalSource: config.source })
    .select(selectedFields)
    .lean()) as ProductLean[];

  const legacyDocs = (await ProductModel.find({
    $or: [{ externalSource: { $exists: false } }, { externalSource: null }, { externalSource: '' }],
    isService: config.expectedIsService,
  })
    .select(selectedFields)
    .lean()) as ProductLean[];

  const filteredLegacy = legacyDocs.filter((doc) => normNameSet.has(normalizeName(doc.ime)));
  const combined = [...sourceDocs, ...filteredLegacy];
  const unique = new Map<string, ProductLean>();
  for (const doc of combined) {
    unique.set(String(doc._id), doc);
  }
  return Array.from(unique.values());
}

function pickCanonical(docs: ProductLean[]): ProductLean {
  const sorted = docs.slice().sort((a, b) => {
    const activeA = a.isActive === true ? 1 : 0;
    const activeB = b.isActive === true ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;

    const updatedA = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const updatedB = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    if (updatedA !== updatedB) return updatedB - updatedA;

    return String(a._id).localeCompare(String(b._id));
  });
  return sorted[0];
}

function mapSnapshotToSet(row: SnapshotRow, now: Date) {
  return removeUndefined({
    externalSource: row.source,
    externalId: row.externalId,
    externalKey: row.externalKey,
    ime: row.ime,
    kategorija: row.kategorija,
    categorySlugs: row.categorySlugs,
    purchasePriceWithoutVat: row.purchasePriceWithoutVat ?? row.nabavnaCena,
    nabavnaCena: row.nabavnaCena,
    prodajnaCena: row.prodajnaCena,
    kratekOpis: row.kratekOpis,
    dolgOpis: row.dolgOpis,
    povezavaDoSlike: row.povezavaDoSlike,
    povezavaDoProdukta: row.povezavaDoProdukta,
    proizvajalec: row.proizvajalec,
    dobavitelj: row.dobavitelj,
    naslovDobavitelja: row.naslovDobavitelja,
    casovnaNorma: row.casovnaNorma,
    isService: row.isService,
    isActive: true,
    updatedAt: now,
  });
}

async function applyUpdate(docId: string, row: SnapshotRow, now: Date, confirm: boolean) {
  if (!confirm) return;
  const $set = mapSnapshotToSet(row, now);
  await ProductModel.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(docId) },
    {
      $set,
      $unset: { mergedInto: '' },
    },
  );
}

async function applyCreate(row: SnapshotRow, now: Date, confirm: boolean) {
  if (!confirm) return;
  const insert = {
    ...mapSnapshotToSet(row, now),
    createdAt: now,
  };
  await ProductModel.collection.insertOne(insert);
}

async function applyDeactivateDuplicates(canonicalId: string, duplicateIds: string[], now: Date, confirm: boolean) {
  if (!confirm || duplicateIds.length === 0) return;
  const objectIds = duplicateIds.map((id) => new mongoose.Types.ObjectId(id));
  await ProductModel.collection.updateMany(
    { _id: { $in: objectIds } },
    {
      $set: {
        isActive: false,
        mergedInto: canonicalId,
        updatedAt: now,
      },
    },
  );
}

async function reconcileSource(config: SourceConfig, confirm: boolean): Promise<SourceReport> {
  const snapshotRows = parseSnapshot(config);
  const snapshotByKey = new Map(snapshotRows.map((row) => [row.externalKey, row]));
  const snapshotByNormName = new Map<string, SnapshotRow[]>();
  for (const row of snapshotRows) {
    const existing = snapshotByNormName.get(row.normName) ?? [];
    existing.push(row);
    snapshotByNormName.set(row.normName, existing);
  }

  const conflicts: ConflictRecord[] = [];
  for (const [normName, rows] of snapshotByNormName.entries()) {
    if (rows.length > 1) {
      conflicts.push({
        source: config.source,
        kind: 'snapshot_name_conflict',
        normName,
        snapshotExternalKeys: rows.map((row) => row.externalKey),
      });
    }
  }

  const candidates = await loadCandidates(config, new Set(snapshotByNormName.keys()));
  const dbByKey = new Map<string, ProductLean[]>();
  const dbByNormName = new Map<string, ProductLean[]>();
  for (const doc of candidates) {
    const key = normalizeText(doc.externalKey);
    if (key) {
      const arr = dbByKey.get(key) ?? [];
      arr.push(doc);
      dbByKey.set(key, arr);
    }
    const normName = normalizeName(doc.ime);
    if (normName) {
      const arr = dbByNormName.get(normName) ?? [];
      arr.push(doc);
      dbByNormName.set(normName, arr);
    }
  }

  const merges: MergeRecord[] = [];
  const creates: CreateRecord[] = [];
  const actions: ReconcileAction[] = [];
  const matchedByKey = new Set<string>();
  const claimedDocIds = new Set<string>();
  let updatedCount = 0;
  let createdCount = 0;
  let reactivatedCount = 0;
  let remappedByNameCount = 0;
  let duplicatesFound = 0;
  const now = new Date();

  for (const [externalKey, row] of snapshotByKey.entries()) {
    const docs = dbByKey.get(externalKey) ?? [];
    if (docs.length === 0) {
      continue;
    }
    matchedByKey.add(externalKey);

    if (docs.length === 1) {
      const doc = docs[0];
      await applyUpdate(String(doc._id), row, now, confirm);
      updatedCount += 1;
      if (doc.isActive !== true) {
        reactivatedCount += 1;
      }
      actions.push('updated_by_key');
      claimedDocIds.add(String(doc._id));
      continue;
    }

    const canonical = pickCanonical(docs);
    const canonicalId = String(canonical._id);
    const duplicateIds = docs
      .map((doc) => String(doc._id))
      .filter((id) => id !== canonicalId);
    await applyUpdate(canonicalId, row, now, confirm);
    await applyDeactivateDuplicates(canonicalId, duplicateIds, now, confirm);

    duplicatesFound += duplicateIds.length;
    updatedCount += 1;
    if (canonical.isActive !== true) {
      reactivatedCount += 1;
    }
    merges.push({
      source: config.source,
      reason: 'duplicate_by_key',
      snapshotExternalKey: externalKey,
      canonicalId,
      mergedIds: duplicateIds,
    });
    actions.push('deduped_by_key');
    claimedDocIds.add(canonicalId);
    duplicateIds.forEach((id) => claimedDocIds.add(id));
  }

  const unresolved = snapshotRows.filter((row) => !matchedByKey.has(row.externalKey));
  for (const row of unresolved) {
    const hasNameConflict = (snapshotByNormName.get(row.normName)?.length ?? 0) > 1;
    const rawCandidates = dbByNormName.get(row.normName) ?? [];
    const availableCandidates = rawCandidates.filter((doc) => !claimedDocIds.has(String(doc._id)));

    if (hasNameConflict) {
      await applyCreate(row, now, confirm);
      createdCount += 1;
      creates.push({
        source: config.source,
        snapshotExternalKey: row.externalKey,
        name: row.ime,
      });
      actions.push('created');
      continue;
    }

    if (availableCandidates.length === 0) {
      await applyCreate(row, now, confirm);
      createdCount += 1;
      creates.push({
        source: config.source,
        snapshotExternalKey: row.externalKey,
        name: row.ime,
      });
      actions.push('created');
      continue;
    }

    if (availableCandidates.length === 1) {
      const doc = availableCandidates[0];
      await applyUpdate(String(doc._id), row, now, confirm);
      updatedCount += 1;
      remappedByNameCount += 1;
      if (doc.isActive !== true) {
        reactivatedCount += 1;
      }
      actions.push('remapped_by_name');
      claimedDocIds.add(String(doc._id));
      continue;
    }

    const canonical = pickCanonical(availableCandidates);
    const canonicalId = String(canonical._id);
    const duplicateIds = availableCandidates
      .map((doc) => String(doc._id))
      .filter((id) => id !== canonicalId);
    await applyUpdate(canonicalId, row, now, confirm);
    await applyDeactivateDuplicates(canonicalId, duplicateIds, now, confirm);
    duplicatesFound += duplicateIds.length;
    updatedCount += 1;
    remappedByNameCount += 1;
    if (canonical.isActive !== true) {
      reactivatedCount += 1;
    }
    merges.push({
      source: config.source,
      reason: 'duplicate_by_name',
      snapshotExternalKey: row.externalKey,
      canonicalId,
      mergedIds: duplicateIds,
    });
    actions.push('deduped_by_name');
    claimedDocIds.add(canonicalId);
    duplicateIds.forEach((id) => claimedDocIds.add(id));
  }

  const existingAfter = (await ProductModel.find({
    externalSource: config.source,
    externalKey: { $in: Array.from(snapshotByKey.keys()) },
  })
    .select('externalKey')
    .lean()) as Array<{ externalKey?: string }>;
  const existingAfterSet = new Set(existingAfter.map((entry) => normalizeText(entry.externalKey)).filter(Boolean));
  const missingAfter = snapshotRows.filter((row) => !existingAfterSet.has(row.externalKey)).length;

  return {
    source: config.source,
    totalSnapshot: snapshotRows.length,
    conflictsCount: conflicts.length,
    duplicatesFound,
    remappedByNameCount,
    createdCount,
    updatedCount,
    reactivatedCount,
    missingAfter,
    actions,
    conflicts,
    merges,
    creates,
  };
}

function renderReport(reports: SourceReport[], confirm: boolean, startedAt: Date) {
  const total = reports.reduce(
    (acc, report) => ({
      totalSnapshot: acc.totalSnapshot + report.totalSnapshot,
      conflictsCount: acc.conflictsCount + report.conflictsCount,
      duplicatesFound: acc.duplicatesFound + report.duplicatesFound,
      remappedByNameCount: acc.remappedByNameCount + report.remappedByNameCount,
      createdCount: acc.createdCount + report.createdCount,
      updatedCount: acc.updatedCount + report.updatedCount,
      reactivatedCount: acc.reactivatedCount + report.reactivatedCount,
      missingAfter: acc.missingAfter + report.missingAfter,
    }),
    {
      totalSnapshot: 0,
      conflictsCount: 0,
      duplicatesFound: 0,
      remappedByNameCount: 0,
      createdCount: 0,
      updatedCount: 0,
      reactivatedCount: 0,
      missingAfter: 0,
    },
  );

  const lines: string[] = [];
  lines.push(`# Cenik Reconcile Report`);
  lines.push('');
  lines.push(`- GeneratedAt: ${new Date().toISOString()}`);
  lines.push(`- Mode: ${confirm ? 'CONFIRM (writes applied)' : 'DRY RUN (no writes)'}`);
  lines.push(`- StartedAt: ${startedAt.toISOString()}`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Snapshot rows: ${total.totalSnapshot}`);
  lines.push(`- Updated: ${total.updatedCount}`);
  lines.push(`- Created: ${total.createdCount}`);
  lines.push(`- Reactivated: ${total.reactivatedCount}`);
  lines.push(`- Remapped by name: ${total.remappedByNameCount}`);
  lines.push(`- Duplicates merged: ${total.duplicatesFound}`);
  lines.push(`- Conflicts: ${total.conflictsCount}`);
  lines.push(`- Missing after: ${total.missingAfter}`);
  lines.push('');

  for (const report of reports) {
    lines.push(`## Source: ${report.source}`);
    lines.push('');
    lines.push(`- Snapshot rows: ${report.totalSnapshot}`);
    lines.push(`- Updated: ${report.updatedCount}`);
    lines.push(`- Created: ${report.createdCount}`);
    lines.push(`- Reactivated: ${report.reactivatedCount}`);
    lines.push(`- Remapped by name: ${report.remappedByNameCount}`);
    lines.push(`- Duplicates merged: ${report.duplicatesFound}`);
    lines.push(`- Conflicts: ${report.conflictsCount}`);
    lines.push(`- Missing after: ${report.missingAfter}`);
    lines.push('');
  }

  const allConflicts = reports.flatMap((report) => report.conflicts);
  lines.push('## Conflicts Requiring Manual Review');
  lines.push('');
  if (allConflicts.length === 0) {
    lines.push('- None');
  } else {
    const list = allConflicts.slice(0, 50);
    for (const conflict of list) {
      lines.push(
        `- [${conflict.source}] ${conflict.kind} normName="${conflict.normName}" keys=${conflict.snapshotExternalKeys.join(
          ', ',
        )}`,
      );
    }
    if (allConflicts.length > list.length) {
      lines.push(`- ...and ${allConflicts.length - list.length} more`);
    }
  }
  lines.push('');

  const allMerges = reports.flatMap((report) => report.merges);
  lines.push('## Merge Sample (max 50)');
  lines.push('');
  if (allMerges.length === 0) {
    lines.push('- None');
  } else {
    const list = allMerges.slice(0, 50);
    for (const merge of list) {
      lines.push(
        `- [${merge.source}] ${merge.reason} key=${merge.snapshotExternalKey} canonical=${merge.canonicalId} merged=${merge.mergedIds.join(
          ', ',
        )}`,
      );
    }
    if (allMerges.length > list.length) {
      lines.push(`- ...and ${allMerges.length - list.length} more`);
    }
  }
  lines.push('');

  const allCreates = reports.flatMap((report) => report.creates);
  lines.push('## Created Sample (max 50)');
  lines.push('');
  if (allCreates.length === 0) {
    lines.push('- None');
  } else {
    const list = allCreates.slice(0, 50);
    for (const created of list) {
      lines.push(`- [${created.source}] key=${created.snapshotExternalKey} ime="${created.name}"`);
    }
    if (allCreates.length > list.length) {
      lines.push(`- ...and ${allCreates.length - list.length} more`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const startedAt = new Date();
  const { confirm } = parseArgs();
  loadEnvironment();
  await connectToMongo();

  const reports: SourceReport[] = [];
  for (const config of SOURCE_CONFIGS) {
    const report = await reconcileSource(config, confirm);
    reports.push(report);
  }

  const reportMarkdown = renderReport(reports, confirm, startedAt);
  const reportsDir = path.resolve(__dirname, '..', '..', 'docs', 'cenik');
  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `reconcile-report-${timestamp}.md`);
  fs.writeFileSync(reportPath, reportMarkdown, 'utf8');

  console.log(`RECONCILE mode: ${confirm ? 'CONFIRM' : 'DRY RUN'}`);
  for (const report of reports) {
    console.log(
      `[${report.source}] snapshot=${report.totalSnapshot} updated=${report.updatedCount} created=${report.createdCount} remappedByName=${report.remappedByNameCount} duplicatesMerged=${report.duplicatesFound} missingAfter=${report.missingAfter} conflicts=${report.conflictsCount}`,
    );
  }
  console.log(`REPORT: ${reportPath}`);

  const missingTotal = reports.reduce((acc, report) => acc + report.missingAfter, 0);
  if (missingTotal > 0) {
    console.warn(`WARNING: missingAfter=${missingTotal}. Check report conflicts and rerun after fixes.`);
  }
}

main()
  .catch((error) => {
    console.error('Cenik reconcile failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

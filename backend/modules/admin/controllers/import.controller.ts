import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { Request, Response } from 'express';

import { ProductImportRunModel } from '../../cenik/import-run.model';
import {
  analyzeProductImportFromItems,
  applyProductImportFromItems,
  resolveProductImportConflict,
} from '../../cenik/services/product-sync.service';

const SOURCE_PATHS: Record<string, string | null> = {
  aa_api: 'backend/data/cenik/aa_api_produkti.json',
  services_sheet: 'backend/data/cenik/custom_storitve.json',
  dodatki: null,
  excel: null,
};

const importLocks = new Set<string>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getGitBaseUrl() {
  return process.env.AINTEL_IMPORT_GIT_BASE_URL ?? 'https://raw.githubusercontent.com/zorkojaka/AIntel/main';
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;

      if (status >= 300 && status < 400 && location) {
        const redirectUrl = new URL(location, url).toString();
        response.resume();
        fetchText(redirectUrl).then(resolve).catch(reject);
        return;
      }

      if (status >= 400) {
        response.resume();
        reject(new Error(`Failed to fetch ${url}. Status ${status}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });

    request.on('error', reject);
  });
}

async function fetchSnapshot(source: string) {
  const path = SOURCE_PATHS[source];
  if (path === undefined) {
    throw new Error(`Unsupported source "${source}".`);
  }
  if (path === null) {
    throw new Error(`Source "${source}" does not support remote snapshot fetch.`);
  }

  const base = getGitBaseUrl().replace(/\/$/, '');
  const url = `${base}/${path}`;
  const raw = await fetchText(url);
  const sourceFingerprint = crypto.createHash('sha1').update(raw).digest('hex');
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return { items: parsed, sourceFingerprint };
  }

  if (!isPlainObject(parsed) || !Array.isArray(parsed.products)) {
    throw new Error('Snapshot must be an object with a "products" array.');
  }

  return { items: parsed.products, sourceFingerprint };
}

function getTriggeredBy(req: Request) {
  const user = (req as any)?.user;
  if (!user) return 'system';
  return (
    user.email ||
    user.username ||
    user.userId ||
    user.id ||
    (user._id ? String(user._id) : '') ||
    'system'
  );
}

function buildWarnings(summary: {
  conflictCount: number;
  invalidCount: number;
  toCreateCount: number;
  toUpdateCount: number;
  toSkipCount: number;
}) {
  const warnings: string[] = [];
  if (summary.conflictCount > 0) {
    warnings.push(`${summary.conflictCount} unresolved conflict(s) excluded from auto-apply.`);
  }
  if (summary.invalidCount > 0) {
    warnings.push(`${summary.invalidCount} invalid row(s) excluded from import.`);
  }
  if (
    summary.toCreateCount === 0 &&
    summary.toUpdateCount === 0 &&
    summary.toSkipCount === 0 &&
    (summary.conflictCount > 0 || summary.invalidCount > 0)
  ) {
    warnings.push('No rows were actionable in this run.');
  }
  return warnings;
}

function determineRunStatus(
  mode: 'analyze' | 'apply',
  summary: {
    conflictCount: number;
    invalidCount: number;
  },
) {
  if (mode === 'apply' && summary.conflictCount === 0 && summary.invalidCount === 0) {
    return 'success' as const;
  }
  if (mode === 'analyze' && summary.conflictCount === 0 && summary.invalidCount === 0) {
    return 'success' as const;
  }
  return 'partial' as const;
}

function formatRunResponse(run: any) {
  return {
    id: String(run._id),
    source: run.source,
    mode: run.mode,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    triggeredBy: run.triggeredBy || '',
    status: run.status,
    totalSourceRows: run.totalSourceRows ?? 0,
    matchedRows: run.matchedRows ?? 0,
    toCreateCount: run.toCreateCount ?? 0,
    toUpdateCount: run.toUpdateCount ?? 0,
    toSkipCount: run.toSkipCount ?? 0,
    conflictCount: run.conflictCount ?? 0,
    invalidCount: run.invalidCount ?? 0,
    createdCount: run.createdCount ?? 0,
    updatedCount: run.updatedCount ?? 0,
    skippedCount: run.skippedCount ?? 0,
    unresolvedConflictCount: run.unresolvedConflictCount ?? 0,
    sourceFingerprint: run.sourceFingerprint || '',
    warnings: Array.isArray(run.warnings) ? run.warnings : [],
    errorSummary: run.errorSummary || '',
  };
}

export async function importProductsFromGit(req: Request, res: Response) {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const modeRaw = typeof req.body?.mode === 'string' ? req.body.mode.trim().toLowerCase() : '';
  const legacyConfirm = req.body?.confirm === true;
  const mode = modeRaw === 'apply' || legacyConfirm ? 'apply' : 'analyze';

  if (!source || !(source in SOURCE_PATHS)) {
    return res.fail('Neveljaven vir uvoza.', 400);
  }

  if (req.body?.confirm !== undefined && typeof req.body.confirm !== 'boolean') {
    return res.fail('Potrditev mora biti boolean.', 400);
  }

  if (modeRaw && modeRaw !== 'analyze' && modeRaw !== 'apply') {
    return res.fail('Neveljaven nacin uvoza.', 400);
  }

  const lockKey = `import:${source}`;
  if (importLocks.has(lockKey)) {
    return res.fail('Uvoz ze tece. Poskusi znova kasneje.', 429);
  }

  const startedAt = new Date();
  const triggeredBy = getTriggeredBy(req);
  const run = await ProductImportRunModel.create({
    source,
    mode,
    startedAt,
    triggeredBy,
    status: 'failed',
    warnings: [],
  });

  importLocks.add(lockKey);

  try {
    const localItems = Array.isArray(req.body?.items) ? req.body.items : null;
    const snapshot =
      source === 'dodatki'
        ? {
            items: localItems ?? [],
            sourceFingerprint: crypto
              .createHash('sha1')
              .update(JSON.stringify(localItems ?? []))
              .digest('hex'),
          }
        : await fetchSnapshot(source);

    if (source === 'dodatki' && !localItems) {
      return res.fail('Za vir Dodatki je potreben lokalni seznam vrstic.', 400);
    }

    const { items, sourceFingerprint } = snapshot;
    const result =
      mode === 'apply'
        ? await applyProductImportFromItems({ source, items })
        : await analyzeProductImportFromItems({ source, items });
    const summary = result.summary;
    const warnings = buildWarnings(summary);
    const status = determineRunStatus(mode, summary);

    const update: Record<string, unknown> = {
      finishedAt: new Date(),
      status,
      totalSourceRows: summary.totalSourceRows,
      matchedRows: summary.matchedRows,
      toCreateCount: summary.toCreateCount,
      toUpdateCount: summary.toUpdateCount,
      toSkipCount: summary.toSkipCount,
      conflictCount: summary.conflictCount,
      invalidCount: summary.invalidCount,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: summary.toSkipCount,
      unresolvedConflictCount: summary.conflictCount,
      sourceFingerprint,
      warnings,
      errorSummary: '',
    };

    if ('applied' in result && isPlainObject(result.applied)) {
      update.createdCount = Number(result.applied.createdCount ?? 0);
      update.updatedCount = Number(result.applied.updatedCount ?? 0);
      update.skippedCount = Number(result.applied.skippedCount ?? 0);
      update.unresolvedConflictCount = Number(result.applied.excludedConflictCount ?? 0);
    }

    const savedRun = await ProductImportRunModel.findByIdAndUpdate(run._id, update, {
      new: true,
    }).lean();

    return res.success({ mode, run: savedRun ? formatRunResponse(savedRun) : null, ...result });
  } catch (error) {
    console.error('Import from git failed:', error);
    await ProductImportRunModel.findByIdAndUpdate(run._id, {
      finishedAt: new Date(),
      status: 'failed',
      errorSummary: error instanceof Error ? error.message : 'Import failed.',
      warnings: ['Import failed before completion.'],
    }).catch(() => undefined);
    return res.fail('Uvoz ni uspel.', 500);
  } finally {
    importLocks.delete(lockKey);
  }
}

export async function resolveProductImportConflictController(req: Request, res: Response) {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const externalKey = typeof req.body?.externalKey === 'string' ? req.body.externalKey.trim() : '';
  const sourceRecordId =
    typeof req.body?.sourceRecordId === 'string' ? req.body.sourceRecordId.trim() : '';
  const rowFingerprint =
    typeof req.body?.rowFingerprint === 'string' ? req.body.rowFingerprint.trim() : '';
  const actionRaw = typeof req.body?.action === 'string' ? req.body.action.trim() : '';
  const targetProductId =
    typeof req.body?.targetProductId === 'string' ? req.body.targetProductId.trim() : undefined;

  if (!source || !(source in SOURCE_PATHS)) {
    return res.fail('Neveljaven vir uvoza.', 400);
  }

  if (!externalKey || !sourceRecordId || !rowFingerprint) {
    return res.fail('Manjkajo podatki konflikta.', 400);
  }

  if (actionRaw !== 'link_existing' && actionRaw !== 'create_new' && actionRaw !== 'skip') {
    return res.fail('Neveljavna akcija konflikta.', 400);
  }
  const action = actionRaw;

  if (action === 'link_existing' && !targetProductId) {
    return res.fail('Za povezavo z obstojecim produktom je potreben targetProductId.', 400);
  }

  try {
    const resolution = await resolveProductImportConflict({
      source,
      externalKey,
      sourceRecordId,
      rowFingerprint,
      action,
      targetProductId,
    });
    return res.success(resolution);
  } catch (error) {
    console.error('Resolve product import conflict failed:', error);
    return res.fail(error instanceof Error ? error.message : 'Razresitev konflikta ni uspela.', 400);
  }
}

export async function getProductImportRuns(req: Request, res: Response) {
  const limitRaw = Number(req.query?.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

  try {
    const runs = await ProductImportRunModel.find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();
    return res.success(runs.map((run) => formatRunResponse(run)));
  } catch (error) {
    console.error('Fetch product import runs failed:', error);
    return res.fail('Pridobivanje zgodovine uvozov ni uspelo.', 500);
  }
}

export async function getProductImportRunById(req: Request, res: Response) {
  try {
    const run = await ProductImportRunModel.findById(req.params.id).lean();
    if (!run) {
      return res.fail('Import run ne obstaja.', 404);
    }
    return res.success(formatRunResponse(run));
  } catch (error) {
    console.error('Fetch product import run failed:', error);
    return res.fail('Pridobivanje podrobnosti uvoza ni uspelo.', 500);
  }
}

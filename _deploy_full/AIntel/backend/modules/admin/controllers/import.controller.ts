import http from 'http';
import https from 'https';
import { Request, Response } from 'express';

import {
  ProductSyncValidationError,
  syncProductsFromItems,
  type SyncReport,
  type ValidationError
} from '../../cenik/services/product-sync.service';

const SOURCE_PATHS: Record<string, string> = {
  aa_api: 'backend/data/cenik/aa_api_produkti.json',
  services_sheet: 'backend/data/cenik/custom_storitve.json'
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
  if (!path) {
    throw new Error(`Unsupported source "${source}".`);
  }

  const base = getGitBaseUrl().replace(/\/$/, '');
  const url = `${base}/${path}`;
  const raw = await fetchText(url);
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!isPlainObject(parsed) || !Array.isArray(parsed.products)) {
    throw new Error('Snapshot must be an object with a "products" array.');
  }

  return parsed.products;
}

function formatValidationResponse(report: SyncReport | null, errors: ValidationError[]) {
  return {
    success: false,
    data: {
      report,
      errors
    },
    error: 'Validation failed.'
  };
}

export async function importProductsFromGit(req: Request, res: Response) {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const confirm = req.body?.confirm === true;

  if (!source || !(source in SOURCE_PATHS)) {
    return res.fail('Neveljaven vir uvoza.', 400);
  }

  if (req.body?.confirm !== undefined && typeof req.body.confirm !== 'boolean') {
    return res.fail('Potrditev mora biti boolean.', 400);
  }

  const lockKey = `import:${source}`;
  if (importLocks.has(lockKey)) {
    return res.fail('Uvoz ze tece. Poskusi znova kasneje.', 429);
  }

  importLocks.add(lockKey);

  try {
    const items = await fetchSnapshot(source);
    try {
      const report = await syncProductsFromItems({ source, items, confirm });
      return res.success({ report, errors: [] });
    } catch (error) {
      if (error instanceof ProductSyncValidationError) {
        const emptyReport: SyncReport = {
          source,
          total: items.length,
          created: 0,
          updated: 0,
          reactivated: 0,
          wouldDeactivate: 0,
          deactivated: 0
        };
        const payload = formatValidationResponse(emptyReport, error.errors);
        return res.status(400).json(payload);
      }
      throw error;
    }
  } catch (error) {
    console.error('Import from git failed:', error);
    return res.fail('Uvoz ni uspel.', 500);
  } finally {
    importLocks.delete(lockKey);
  }
}

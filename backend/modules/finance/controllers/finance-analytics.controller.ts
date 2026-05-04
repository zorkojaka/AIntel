import { Request, Response } from 'express';
import {
  getBasketAnalysis,
  getEmployeesSummary,
  getMonthlySummary,
  getPipelineSummary,
  getProductBundles,
  getProductCooccurrence,
  getProductFrequency,
} from '../services/finance-analytics.service';
import { getProjectSnapshot, listFinanceSnapshots } from '../services/finance-snapshot.service';

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildRange(req: Request) {
  return {
    from: parseDate((req.query.dateFrom as string) ?? (req.query.from as string)),
    to: parseDate((req.query.dateTo as string) ?? (req.query.to as string)),
  };
}

export async function monthlySummary(req: Request, res: Response) {
  const year = parseNumber(req.query.year as string, new Date().getFullYear());
  const data = await getMonthlySummary(year);
  console.log('[finance][monthly-summary]', { year, count: data.length, sample: data[0] });
  return res.success(data);
}

export async function employeesSummary(req: Request, res: Response) {
  const data = await getEmployeesSummary(buildRange(req));
  return res.success(data);
}

export async function productFrequency(req: Request, res: Response) {
  const limit = Math.max(1, parseNumber(req.query.limit as string, 20));
  const range = buildRange(req);
  const data = await getProductFrequency(range, limit);
  console.log('[finance][product-frequency]', { limit, range, count: data.length, sample: data[0] });
  return res.success(data);
}

export async function basketAnalysis(req: Request, res: Response) {
  const minSupport = Math.max(1, parseNumber(req.query.minSupport as string, 2));
  const includeServices = String(req.query.includeServices ?? 'false') === 'true';
  const data = await getBasketAnalysis(minSupport, includeServices);
  return res.success(data);
}

export async function pipelineSummary(_req: Request, res: Response) {
  const data = await getPipelineSummary();
  console.log('[finance][pipeline]', { statuses: data.statuses });
  return res.success(data);
}

export async function snapshotsList(req: Request, res: Response) {
  const page = Math.max(1, parseNumber(req.query.page as string, 1));
  const limit = Math.min(200, Math.max(1, parseNumber(req.query.limit as string, 20)));
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  const data = await listFinanceSnapshots({
    page,
    limit,
    dateFrom: parseDate(req.query.dateFrom as string),
    dateTo: parseDate(req.query.dateTo as string),
    projectId: projectId || undefined,
  });
  return res.success(data);
}

export async function snapshotByProject(req: Request, res: Response) {
  const snapshot = await getProjectSnapshot(req.params.projectId);
  if (!snapshot) {
    return res.fail('Finance snapshot ni najden.', 404);
  }
  return res.success(snapshot);
}


export async function productCooccurrence(req: Request, res: Response) {
  const rawYear = parseNumber(req.query.year as string, NaN);
  const year = Number.isFinite(rawYear) ? rawYear : null;
  const data = await getProductCooccurrence(year);
  return res.success(data);
}

export async function productBundles(req: Request, res: Response) {
  const rawYear = parseNumber(req.query.year as string, NaN);
  const year = Number.isFinite(rawYear) ? rawYear : null;
  const data = await getProductBundles(year);
  return res.success(data);
}

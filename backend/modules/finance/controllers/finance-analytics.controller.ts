import { Request, Response } from 'express';
import { ProjectModel } from '../../projects/schemas/project';
import { FinanceSnapshotModel } from '../schemas/finance-snapshot';
import {
  getBasketAnalysis,
  getEmployeeProjectEarningDetail,
  getEmployeesSummary,
  getMonthlySummary,
  getPipelineSummary,
  getProductBundles,
  getProductCooccurrence,
  getProductFrequency,
  setEmployeeProjectEarningPaid,
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

export async function employeeProjectEarningDetail(req: Request, res: Response) {
  const employeeId = typeof req.params.employeeId === 'string' ? req.params.employeeId.trim() : '';
  const snapshotId = typeof req.params.snapshotId === 'string' ? req.params.snapshotId.trim() : '';
  const data = await getEmployeeProjectEarningDetail(employeeId, snapshotId);
  if (!data) {
    return res.fail('Razčlemba zaslužka ni najdena.', 404);
  }
  return res.success(data);
}

function resolvePaidBy(req: Request) {
  const authUserId = typeof (req as any).authUser?._id === 'string' ? (req as any).authUser._id : '';
  if (authUserId) return authUserId;
  const userId = typeof (req as any).user?._id === 'string' ? (req as any).user._id : '';
  return userId || null;
}

export async function updateEmployeeProjectEarningPayment(req: Request, res: Response) {
  const employeeId = typeof req.params.employeeId === 'string' ? req.params.employeeId.trim() : '';
  const snapshotId = typeof req.params.snapshotId === 'string' ? req.params.snapshotId.trim() : '';
  const isPaid = req.body?.isPaid === true;
  const data = await setEmployeeProjectEarningPaid({
    employeeId,
    snapshotId,
    isPaid,
    paidBy: resolvePaidBy(req),
  });
  if (!data) {
    return res.fail('Zaslužek zaposlenega ni najden.', 404);
  }
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

export async function invoicesList(_req: Request, res: Response) {
  const projects = await ProjectModel.find({
    invoiceVersions: { $exists: true, $ne: [] },
  })
    .select({ id: 1, title: 1, customer: 1, invoiceVersions: 1 })
    .lean();

  const invoiceVersionIds = projects.flatMap((project: any) =>
    (project.invoiceVersions ?? [])
      .map((version: any) => String(version?._id ?? ''))
      .filter(Boolean),
  );
  const snapshots = invoiceVersionIds.length
    ? await FinanceSnapshotModel.find({ invoiceVersionId: { $in: invoiceVersionIds } })
        .select({ invoiceVersionId: 1, superseded: 1 })
        .lean()
    : [];
  const snapshotByVersionId = new Map<string, { superseded?: boolean }>(
    snapshots.map((snapshot: any) => [String(snapshot.invoiceVersionId), snapshot]),
  );

  const rows = projects.flatMap((project: any) =>
    (project.invoiceVersions ?? [])
      .filter((version: any) => version?.invoiceNumber && version?.status !== 'cancelled')
      .map((version: any) => {
        const versionId = String(version._id);
        const snapshot = snapshotByVersionId.get(versionId);
        if (snapshot?.superseded === true) {
          return null;
        }
        return {
          projectId: project.id,
          projectTitle: project.title ?? project.id,
          customerName: project.customer?.name ?? '',
          invoiceVersionId: versionId,
          versionNumber: version.versionNumber ?? null,
          invoiceNumber: version.invoiceNumber ?? '',
          status: version.status ?? 'draft',
          issuedAt: version.issuedAt ?? null,
          createdAt: version.createdAt ?? null,
          totalWithVat: version.summary?.totalWithVat ?? 0,
          totalWithoutVat: version.summary?.discountedBase ?? version.summary?.baseWithoutVat ?? 0,
          hasFinanceSnapshot: Boolean(snapshot),
        };
      })
      .filter(Boolean),
  );

  rows.sort((a, b) => {
    const left = new Date(a.issuedAt ?? a.createdAt ?? 0).valueOf();
    const right = new Date(b.issuedAt ?? b.createdAt ?? 0).valueOf();
    return right - left;
  });

  return res.success({ items: rows });
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

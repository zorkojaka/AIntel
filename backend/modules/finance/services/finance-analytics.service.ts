import { FinanceSnapshotModel } from '../schemas/finance-snapshot';
import { OfferVersionModel } from '../../projects/schemas/offer-version';
import { EmployeeModel } from '../../employees/schemas/employee';

type DateRange = { from?: Date; to?: Date };
type YearFilter = number | null;

const analyticsCache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRange(range: DateRange) {
  const issuedAt: Record<string, Date> = {};
  if (range.from) issuedAt.$gte = range.from;
  if (range.to) issuedAt.$lte = range.to;
  return Object.keys(issuedAt).length ? issuedAt : null;
}

function getYearMatch(year: YearFilter) {
  if (!year) return {};
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  return { issuedAt: { $gte: from, $lt: to } };
}

async function withCache<T>(key: string, producer: () => Promise<T>): Promise<T> {
  const cached = analyticsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const value = await producer();
  analyticsCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export async function getProductCooccurrence(year: YearFilter) {
  return withCache(`cooccurrence:${year ?? 'all'}`, async () => {
    const snapshots = await FinanceSnapshotModel.find({ superseded: { $ne: true }, ...getYearMatch(year) }).lean();
    const pairMap = new Map<string, { productA: { id: string; name: string }; productB: { id: string; name: string }; count: number; totalRevenue: number }>();
    snapshots.forEach((snapshot) => {
      const products = new Map<string, { id: string; name: string; revenue: number }>();
      (snapshot.items ?? []).forEach((item) => {
        if (!item.productId) return;
        const id = String(item.productId);
        const current = products.get(id) ?? { id, name: item.name, revenue: 0 };
        current.revenue += toNumber(item.totalSale, 0);
        products.set(id, current);
      });
      const list = Array.from(products.values()).sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]; const b = list[j];
        const key = `${a.id}::${b.id}`;
        const row = pairMap.get(key) ?? { productA: { id: a.id, name: a.name }, productB: { id: b.id, name: b.name }, count: 0, totalRevenue: 0 };
        row.count += 1;
        row.totalRevenue += a.revenue + b.revenue;
        pairMap.set(key, row);
      }
    });
    return Array.from(pairMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  });
}

export async function getProductBundles(year: YearFilter) {
  return withCache(`bundles:${year ?? 'all'}`, async () => {
    const pairs = await getProductCooccurrence(year);
    const bundleMap = new Map<string, { product: { id: string; name: string }; companions: Array<{ id: string; name: string; count: number; share: number }> }>();
    const totalByProduct = new Map<string, number>();
    pairs.forEach((pair) => {
      totalByProduct.set(pair.productA.id, (totalByProduct.get(pair.productA.id) ?? 0) + pair.count);
      totalByProduct.set(pair.productB.id, (totalByProduct.get(pair.productB.id) ?? 0) + pair.count);
    });
    pairs.forEach((pair) => {
      const rows: Array<[typeof pair.productA, typeof pair.productB]> = [[pair.productA, pair.productB], [pair.productB, pair.productA]];
      rows.forEach(([product, companion]) => {
        const current = bundleMap.get(product.id) ?? { product, companions: [] };
        const total = totalByProduct.get(product.id) ?? 1;
        current.companions.push({ id: companion.id, name: companion.name, count: pair.count, share: (pair.count / total) * 100 });
        bundleMap.set(product.id, current);
      });
    });
    return Array.from(bundleMap.values())
      .map((row) => ({ ...row, companions: row.companions.sort((a, b) => b.count - a.count).slice(0, 3) }))
      .slice(0, 20);
  });
}

export async function getMonthlySummary(year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  return FinanceSnapshotModel.aggregate([
    { $match: { superseded: { $ne: true }, issuedAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: { $month: '$issuedAt' },
        totalSaleWithVat: { $sum: '$summary.totalSaleWithVat' },
        totalSaleWithoutVat: { $sum: '$summary.totalSaleWithoutVat' },
        totalPurchase: { $sum: '$summary.totalPurchase' },
        totalMargin: { $sum: '$summary.totalMargin' },
        projectIds: { $addToSet: '$projectId' },
      },
    },
    {
      $project: {
        _id: 0,
        month: '$_id',
        totalSaleWithVat: 1,
        totalSaleWithoutVat: 1,
        totalPurchase: 1,
        totalMargin: 1,
        projectCount: { $size: '$projectIds' },
      },
    },
    { $sort: { month: 1 } },
  ]);
}

export async function getProductFrequency(range: DateRange, limit: number) {
  const issuedAt = normalizeRange(range);
  return FinanceSnapshotModel.aggregate([
    { $match: { superseded: { $ne: true }, ...(issuedAt ? { issuedAt } : {}) } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { productId: '$items.productId', name: '$items.name' },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.totalSale' },
        totalPurchase: { $sum: '$items.totalPurchase' },
        totalMargin: { $sum: '$items.margin' },
      },
    },
    {
      $project: {
        _id: 0,
        productId: '$_id.productId',
        name: '$_id.name',
        totalQuantity: 1,
        totalRevenue: 1,
        totalPurchase: 1,
        totalMargin: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: limit },
  ]);
}

export async function getBasketAnalysis(minSupport: number, includeServices: boolean) {
  const snapshots = await FinanceSnapshotModel.find({ superseded: { $ne: true } }).lean();
  const pairs = new Map<string, { productA: string; productB: string; coOccurrenceCount: number; projectIds: string[] }>();

  snapshots.forEach((snapshot) => {
    const productSet = new Set<string>();
    (snapshot.items ?? []).forEach((item) => {
      if (!item.productId) return;
      if (!includeServices && item.isService) return;
      productSet.add(item.productId);
    });
    const ids = Array.from(productSet).sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const productA = ids[i];
        const productB = ids[j];
        const key = `${productA}::${productB}`;
        const current = pairs.get(key) ?? { productA, productB, coOccurrenceCount: 0, projectIds: [] };
        current.coOccurrenceCount += 1;
        current.projectIds.push(snapshot.projectId);
        pairs.set(key, current);
      }
    }
  });

  return Array.from(pairs.values())
    .filter((row) => row.coOccurrenceCount >= minSupport)
    .sort((a, b) => b.coOccurrenceCount - a.coOccurrenceCount);
}

export async function getEmployeesSummary(range: DateRange) {
  const issuedAt = normalizeRange(range);
  const aggregated = await FinanceSnapshotModel.aggregate([
    { $match: { superseded: { $ne: true }, ...(issuedAt ? { issuedAt } : {}) } },
    { $unwind: '$employeeEarnings' },
    {
      $group: {
        _id: '$employeeEarnings.employeeId',
        totalEarned: { $sum: '$employeeEarnings.earnings' },
        totalPaid: {
          $sum: {
            $cond: [{ $eq: ['$employeeEarnings.isPaid', true] }, '$employeeEarnings.earnings', 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        employeeId: '$_id',
        totalEarned: 1,
        totalPaid: 1,
        totalUnpaid: { $subtract: ['$totalEarned', '$totalPaid'] },
      },
    },
  ]);

  const employeeIds = aggregated.map((row) => row.employeeId).filter(Boolean);
  const employees = await EmployeeModel.find({ _id: { $in: employeeIds } }).lean();
  const employeeMap = new Map<string, string>();
  employees.forEach((employee) => {
    employeeMap.set(String(employee._id), employee.name);
  });

  return aggregated.map((row) => ({
    ...row,
    employeeName: employeeMap.get(String(row.employeeId)) ?? String(row.employeeId),
  }));
}

export async function getPipelineSummary() {
  const offers = await OfferVersionModel.find().lean();
  const byStatus = new Map<string, { count: number; totalGross: number }>();
  const bySalesUser = new Map<string, { count: number; totalGross: number }>();
  const decisionDurations: number[] = [];

  offers.forEach((offer) => {
    const status = offer.status ?? 'draft';
    const current = byStatus.get(status) ?? { count: 0, totalGross: 0 };
    current.count += 1;
    current.totalGross += toNumber(offer.totalGross, 0);
    byStatus.set(status, current);

    const salesUserId = offer.sentByUserId ? String(offer.sentByUserId) : 'unassigned';
    const byUser = bySalesUser.get(salesUserId) ?? { count: 0, totalGross: 0 };
    byUser.count += 1;
    byUser.totalGross += toNumber(offer.totalGross, 0);
    bySalesUser.set(salesUserId, byUser);

    if (['accepted', 'rejected', 'cancelled'].includes(status) && offer.sentAt && offer.updatedAt) {
      const diffDays = (new Date(offer.updatedAt).valueOf() - new Date(offer.sentAt).valueOf()) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(diffDays) && diffDays >= 0) {
        decisionDurations.push(diffDays);
      }
    }
  });

  const accepted = byStatus.get('accepted')?.count ?? 0;
  const rejected = byStatus.get('rejected')?.count ?? 0;
  const cancelled = byStatus.get('cancelled')?.count ?? 0;
  const denominator = accepted + rejected + cancelled;

  return {
    statuses: ['draft', 'offered', 'accepted', 'rejected', 'cancelled'].map((status) => ({
      status,
      count: byStatus.get(status)?.count ?? 0,
      totalGross: byStatus.get(status)?.totalGross ?? 0,
    })),
    winRate: denominator > 0 ? (accepted / denominator) * 100 : 0,
    averageDaysToDecision: decisionDurations.length
      ? decisionDurations.reduce((sum, value) => sum + value, 0) / decisionDurations.length
      : 0,
    perSalesUser: Array.from(bySalesUser.entries()).map(([salesUserId, values]) => ({
      salesUserId,
      ...values,
    })),
  };
}

import { FinanceSnapshotModel } from '../schemas/finance-snapshot';
import { OfferVersionModel } from '../../projects/schemas/offer-version';
import { EmployeeModel } from '../../employees/schemas/employee';
import { WorkOrderModel } from '../../projects/schemas/work-order';
import { EmployeeServiceRateModel } from '../../employee-profiles/schemas/employee-service-rate';
import { ProductModel } from '../../cenik/product.model';

type DateRange = { from?: Date; to?: Date };
type YearFilter = number | null;

const analyticsCache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isObjectId(value: string | null | undefined) {
  return Boolean(value && /^[a-f\d]{24}$/i.test(value));
}

function normalizeEmployeeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object') {
    if (typeof (value as { toHexString?: unknown }).toHexString === 'function') {
      return (value as { toHexString: () => string }).toHexString();
    }
    const objectValue = value as { _id?: unknown; id?: unknown };
    const nestedValue = objectValue._id ?? objectValue.id;
    if (nestedValue && nestedValue !== value) {
      return normalizeEmployeeId(nestedValue);
    }
    if (typeof (value as { toString?: unknown }).toString === 'function') {
      const stringValue = String(value);
      return stringValue && stringValue !== '[object Object]' ? stringValue : null;
    }
  }
  return null;
}

function getCompletedBy(item: any): string | null {
  return (
    normalizeEmployeeId(item?.completedBy) ??
    normalizeEmployeeId(item?.completedByEmployeeId) ??
    normalizeEmployeeId(item?.executedBy) ??
    normalizeEmployeeId(item?.executedByEmployeeId) ??
    normalizeEmployeeId(item?.markedDoneBy) ??
    normalizeEmployeeId(item?.markedDoneByEmployeeId) ??
    normalizeEmployeeId(item?.doneBy) ??
    normalizeEmployeeId(item?.doneByEmployeeId)
  );
}

function getMatchingServiceItemsForSnapshotItem(workOrders: any[], snapshotItem: any) {
  const productId = snapshotItem.productId ? String(snapshotItem.productId) : null;
  const name = normalizeText(snapshotItem.name);
  return workOrders.flatMap((workOrder) =>
    (workOrder.items ?? []).filter((item: any) => {
      if (item.isService !== true) return false;
      if (productId && item.productId && String(item.productId) === productId) return true;
      return Boolean(name && normalizeText(item.name) === name);
    }),
  );
}

async function resolveRateServiceProductId(serviceProductId: string) {
  if (!isObjectId(serviceProductId)) return serviceProductId;
  const product = await ProductModel.findById(serviceProductId).select('mergedIntoProductId').lean();
  const mergedIntoProductId = normalizeEmployeeId((product as { mergedIntoProductId?: unknown } | null)?.mergedIntoProductId);
  return mergedIntoProductId && isObjectId(mergedIntoProductId) ? mergedIntoProductId : serviceProductId;
}

async function getEmployeeServiceUnitPrice(employeeId: string, serviceProductId: string, snapshotUnitPriceSale: number) {
  if (!isObjectId(employeeId) || !isObjectId(serviceProductId)) return 0;
  const rateServiceProductId = await resolveRateServiceProductId(serviceProductId);

  const rate = await EmployeeServiceRateModel.findOne({
    employeeId,
    serviceProductId: rateServiceProductId,
    isActive: true,
  }).lean();
  if (!rate) return 0;

  const overridePrice = rate.overridePrice === null || rate.overridePrice === undefined ? null : toNumber(rate.overridePrice, 0);
  return overridePrice ?? round(snapshotUnitPriceSale * (toNumber(rate.defaultPercent, 0) / 100));
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

export async function getEmployeeProjectEarningDetail(employeeId: string, snapshotId: string) {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  if (!normalizedEmployeeId || !isObjectId(snapshotId)) return null;

  const snapshot = await FinanceSnapshotModel.findOne({
    _id: snapshotId,
    superseded: { $ne: true },
    'employeeEarnings.employeeId': normalizedEmployeeId,
  }).lean();
  if (!snapshot) return null;

  const earning = (snapshot.employeeEarnings ?? []).find((entry) => String(entry.employeeId) === normalizedEmployeeId);
  if (!earning) return null;

  const workOrders = await WorkOrderModel.find({ projectId: snapshot.projectId }).lean();
  const items: Array<{ name: string; quantity: number; unit: string; unitPrice: number; total: number }> = [];

  for (const snapshotItem of snapshot.items ?? []) {
    if (!snapshotItem.isService || !snapshotItem.productId) continue;

    const serviceProductId = String(snapshotItem.productId);
    const unitPrice = await getEmployeeServiceUnitPrice(
      normalizedEmployeeId,
      serviceProductId,
      toNumber(snapshotItem.unitPriceSale, 0),
    );
    if (unitPrice <= 0) continue;

    let quantity = 0;
    const workOrderItems = getMatchingServiceItemsForSnapshotItem(workOrders, snapshotItem);
    workOrderItems.forEach((workOrderItem: any) => {
      const executionUnits = workOrderItem.executionSpec?.executionUnits ?? [];
      if (executionUnits.length === 0) {
        if (!workOrderItem.isCompleted || getCompletedBy(workOrderItem) !== normalizedEmployeeId) return;
        quantity += toNumber(workOrderItem.executedQuantity, toNumber(snapshotItem.quantity, 1));
        return;
      }
      executionUnits.forEach((unit: any) => {
        if (unit.isCompleted && getCompletedBy(unit) === normalizedEmployeeId) {
          quantity += 1;
        }
      });
    });

    if (quantity > 0) {
      items.push({
        name: snapshotItem.name,
        quantity,
        unit: snapshotItem.unit,
        unitPrice,
        total: round(unitPrice * quantity),
      });
    }
  }

  return {
    snapshotId: String(snapshot._id),
    projectId: snapshot.projectId,
    invoiceNumber: snapshot.invoiceNumber,
    customerName: snapshot.customer?.name ?? '',
    issuedAt: snapshot.issuedAt,
    totalEarnings: round(toNumber(earning.earnings, 0)),
    isPaid: Boolean(earning.isPaid),
    items,
    itemTotal: round(items.reduce((sum, item) => sum + item.total, 0)),
  };
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

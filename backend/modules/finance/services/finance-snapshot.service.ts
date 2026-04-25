import { FilterQuery } from 'mongoose';
import { ProductModel } from '../../cenik/product.model';
import { WorkOrderModel, type WorkOrderDocument } from '../../projects/schemas/work-order';
import { OfferVersionModel } from '../../projects/schemas/offer-version';
import { EmployeeServiceRateModel } from '../../employee-profiles/schemas/employee-service-rate';
import { FinanceSnapshotModel, type FinanceSnapshotDocument } from '../schemas/finance-snapshot';

type InvoiceItemType = 'Osnovno' | 'Dodatno' | 'Manj';

interface InvoiceItemInput {
  id?: string;
  productId?: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  totalWithoutVat: number;
  type: InvoiceItemType;
}

interface InvoiceVersionInput {
  _id: string;
  versionNumber: number;
  issuedAt: string | null;
  items: InvoiceItemInput[];
  summary?: {
    baseWithoutVat?: number;
    discountedBase?: number;
    vatAmount?: number;
    totalWithVat?: number;
  };
}

interface ProjectInput {
  id: string;
  customer?: { name?: string; taxId?: string; address?: string };
  confirmedOfferVersionId?: string | null;
  salesUserId?: string | null;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function normalizeDate(date: string | null | undefined) {
  const parsed = date ? new Date(date) : new Date();
  return Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeId(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isObjectId(value: string | null) {
  return Boolean(value && /^[a-f\d]{24}$/i.test(value));
}

function getPurchasePrice(product: { purchasePriceWithoutVat?: number; nabavnaCena?: number } | null | undefined) {
  return toNumber(product?.purchasePriceWithoutVat ?? product?.nabavnaCena ?? 0, 0);
}

function resolveAssignedEmployeeIds(workOrders: Array<Pick<WorkOrderDocument, 'assignedEmployeeIds'>>) {
  const ids = new Set<string>();
  workOrders.forEach((order) => {
    (order.assignedEmployeeIds ?? []).forEach((employeeId) => {
      if (employeeId) {
        ids.add(String(employeeId));
      }
    });
  });
  return Array.from(ids);
}

function resolveExecutedQuantitiesByProduct(workOrders: Array<Pick<WorkOrderDocument, 'items'>>) {
  const quantities = new Map<string, number>();
  workOrders.forEach((order) => {
    (order.items ?? []).forEach((item) => {
      if (!item.productId) return;
      const key = String(item.productId);
      quantities.set(key, (quantities.get(key) ?? 0) + toNumber(item.executedQuantity, 0));
    });
  });
  return quantities;
}

export async function createFinanceSnapshot(params: {
  project: ProjectInput;
  invoiceVersion: InvoiceVersionInput;
  correctedFromInvoiceVersionId?: string | null;
  actorUserId?: string | null;
}) {
  const { project, invoiceVersion, correctedFromInvoiceVersionId } = params;
  const offer = project.confirmedOfferVersionId
    ? await OfferVersionModel.findOne({ _id: project.confirmedOfferVersionId, projectId: project.id }).lean()
    : null;

  const offerProductIdByItemId = new Map<string, string>();
  (offer?.items ?? []).forEach((item) => {
    const itemId = normalizeId(item.id);
    const productId = normalizeId(item.productId);
    if (itemId && productId) {
      offerProductIdByItemId.set(itemId, productId);
    }
  });

  const resolvedProductIds = (invoiceVersion.items ?? []).map((item) => {
    const explicitProductId = normalizeId(item.productId);
    if (explicitProductId) return explicitProductId;

    const itemId = normalizeId(item.id);
    const offerProductId = itemId ? offerProductIdByItemId.get(itemId) : null;
    if (offerProductId) return offerProductId;

    return isObjectId(itemId) ? itemId : null;
  });

  const productIds = Array.from(new Set(resolvedProductIds.filter((id): id is string => Boolean(id) && isObjectId(id))));
  const itemNames = Array.from(
    new Set((invoiceVersion.items ?? []).map((item) => item.name?.trim()).filter((name): name is string => Boolean(name)))
  );

  const [products, workOrders] = await Promise.all([
    productIds.length ? ProductModel.find({ _id: { $in: productIds } }).lean() : Promise.resolve([]),
    WorkOrderModel.find({ projectId: project.id }).lean(),
  ]);

  const productById = new Map<string, (typeof products)[number]>();
  products.forEach((product) => {
    productById.set(String(product._id), product);
  });

  const missingProductNames = itemNames.filter((name) => {
    const normalizedName = normalizeText(name);
    return (invoiceVersion.items ?? []).some((item, index) => {
      if (normalizeText(item.name) !== normalizedName) return false;
      const productId = resolvedProductIds[index];
      return !productId || !productById.has(productId);
    });
  });

  const productsByName = missingProductNames.length
    ? await ProductModel.find({ ime: { $in: missingProductNames } }).lean()
    : [];

  const productByName = new Map<string, (typeof productsByName)[number]>();
  productsByName.forEach((product) => {
    const key = normalizeText(product.ime);
    if (key && !productByName.has(key)) {
      productByName.set(key, product);
    }
  });

  const resolveProductForItem = (item: InvoiceItemInput, index: number) => {
    const productId = resolvedProductIds[index];
    if (productId && productById.has(productId)) {
      return productById.get(productId) ?? null;
    }
    return productByName.get(normalizeText(item.name)) ?? null;
  };

  const resolveProductIdForItem = (item: InvoiceItemInput, index: number) => {
    const product = resolveProductForItem(item, index);
    return product ? String(product._id) : resolvedProductIds[index];
  };

  const assignedEmployeeIds = resolveAssignedEmployeeIds(workOrders as Array<Pick<WorkOrderDocument, 'assignedEmployeeIds'>>);
  const executedQtyByProduct = resolveExecutedQuantitiesByProduct(workOrders as Array<Pick<WorkOrderDocument, 'items'>>);

  const serviceProductIds = Array.from(
    new Set(
      (invoiceVersion.items ?? [])
        .filter((item, index) => {
          const product = resolveProductForItem(item, index);
          return Boolean(product?.isService);
        })
        .map((item, index) => resolveProductIdForItem(item, index))
        .filter((id): id is string => Boolean(id))
    )
  );

  const serviceRates = assignedEmployeeIds.length && serviceProductIds.length
    ? await EmployeeServiceRateModel.find({
      employeeId: { $in: assignedEmployeeIds },
      serviceProductId: { $in: serviceProductIds },
      isActive: true,
    }).lean()
    : [];

  const rateByEmployeeProduct = new Map<string, { defaultPercent: number; overridePrice: number | null }>();
  serviceRates.forEach((rate) => {
    const key = `${String(rate.employeeId)}:${String(rate.serviceProductId)}`;
    rateByEmployeeProduct.set(key, {
      defaultPercent: toNumber(rate.defaultPercent, 0),
      overridePrice: rate.overridePrice === null || rate.overridePrice === undefined ? null : toNumber(rate.overridePrice, 0),
    });
  });

  const employeeEarningsMap = new Map<string, number>();
  assignedEmployeeIds.forEach((id) => employeeEarningsMap.set(id, 0));

  const snapshotItems = (invoiceVersion.items ?? []).map((item, index) => {
    const product = resolveProductForItem(item, index);
    const productId = product ? String(product._id) : resolvedProductIds[index];
    const quantity = toNumber(item.quantity, 0);
    const unitPriceSale = toNumber(item.unitPrice, 0);
    const unitPricePurchase = getPurchasePrice(product);
    const totalSale = toNumber(item.totalWithoutVat, round(quantity * unitPriceSale));
    const totalPurchase = round(quantity * unitPricePurchase);
    const margin = round(totalSale - totalPurchase);
    const isService = Boolean(product?.isService);

    if (!product) {
      console.warn('Purchase price not found for:', item.name);
    }

    if (isService && productId) {
      const executedQty = executedQtyByProduct.get(productId) ?? quantity;
      assignedEmployeeIds.forEach((employeeId) => {
        const rate = rateByEmployeeProduct.get(`${employeeId}:${productId}`);
        if (!rate) return;
        const perUnit = rate.overridePrice ?? round(unitPriceSale * (rate.defaultPercent / 100));
        const earning = round(perUnit * executedQty);
        employeeEarningsMap.set(employeeId, round((employeeEarningsMap.get(employeeId) ?? 0) + earning));
      });
    }

    return {
      productId: productId ?? null,
      name: item.name,
      unit: item.unit,
      quantity,
      unitPriceSale,
      unitPricePurchase,
      vatPercent: toNumber(item.vatPercent, 0),
      totalSale,
      totalPurchase,
      margin,
      isService,
      categorySlugs: product?.categorySlugs ?? [],
      type: item.type,
    };
  });

  const totalSaleWithoutVat = round(snapshotItems.reduce((sum, item) => sum + item.totalSale, 0));
  const totalPurchase = round(snapshotItems.reduce((sum, item) => sum + item.totalPurchase, 0));
  const totalMargin = round(totalSaleWithoutVat - totalPurchase);
  const totalVat = round((invoiceVersion.summary?.vatAmount ?? 0) as number);
  const totalSaleWithVat = round((invoiceVersion.summary?.totalWithVat ?? totalSaleWithoutVat + totalVat) as number);

  let correctedFromSnapshotId: string | null = null;
  let snapshotVersion = 1;

  if (correctedFromInvoiceVersionId) {
    const previous = await FinanceSnapshotModel.findOne({ invoiceVersionId: correctedFromInvoiceVersionId }).sort({ snapshotVersion: -1 });
    if (previous) {
      previous.superseded = true;
      await previous.save();
      correctedFromSnapshotId = String(previous._id);
      snapshotVersion = (previous.snapshotVersion ?? 1) + 1;
    }
  }

  const snapshot = await FinanceSnapshotModel.create({
    projectId: project.id,
    invoiceVersionId: invoiceVersion._id,
    invoiceNumber: `${project.id}-${invoiceVersion.versionNumber}`,
    issuedAt: normalizeDate(invoiceVersion.issuedAt),
    customer: {
      name: project.customer?.name ?? '',
      taxId: project.customer?.taxId ?? '',
      address: project.customer?.address ?? '',
    },
    items: snapshotItems,
    summary: {
      totalSaleWithoutVat,
      totalPurchase,
      totalMargin,
      totalVat,
      totalSaleWithVat,
    },
    assignedEmployeeIds,
    employeeEarnings: assignedEmployeeIds.map((employeeId) => ({
      employeeId,
      earnings: round(employeeEarningsMap.get(employeeId) ?? 0),
      isPaid: false,
      paidAt: null,
      paidBy: null,
    })),
    offerVersionId: project.confirmedOfferVersionId ?? '',
    salesUserId: project.salesUserId ? String(project.salesUserId) : null,
    snapshotVersion,
    correctedFromSnapshotId,
    superseded: false,
  });

  return snapshot;
}

export async function listFinanceSnapshots(params: {
  page: number;
  limit: number;
  dateFrom?: Date;
  dateTo?: Date;
  projectId?: string;
}) {
  const { page, limit, dateFrom, dateTo, projectId } = params;
  const filter: FilterQuery<FinanceSnapshotDocument> = { superseded: { $ne: true } };
  if (projectId) {
    filter.projectId = projectId;
  }
  if (dateFrom || dateTo) {
    filter.issuedAt = {};
    if (dateFrom) filter.issuedAt.$gte = dateFrom;
    if (dateTo) filter.issuedAt.$lte = dateTo;
  }

  const [total, rows] = await Promise.all([
    FinanceSnapshotModel.countDocuments(filter),
    FinanceSnapshotModel.find(filter)
      .sort({ issuedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return { total, page, limit, items: rows };
}

export async function getProjectSnapshot(projectId: string) {
  return FinanceSnapshotModel.findOne({ projectId, superseded: { $ne: true } })
    .sort({ issuedAt: -1, createdAt: -1 })
    .lean();
}

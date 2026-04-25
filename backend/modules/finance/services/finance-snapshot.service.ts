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
  product?: string | { _id?: unknown; id?: unknown } | null;
  cenikItemId?: string | null;
  itemId?: string | null;
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
  customer?: {
    name?: string;
    taxId?: string;
    davkaStevilka?: string;
    vatNumber?: string;
    address?: string;
  };
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

function normalizeRefId(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeId(value);
  }
  if (value && typeof value === 'object') {
    const ref = value as { _id?: unknown; id?: unknown };
    return normalizeRefId(ref._id ?? ref.id);
  }
  return null;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : '';
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

type ExecutionUnitWithEmployee = {
  isCompleted?: boolean;
  completedBy?: unknown;
  completedByEmployeeId?: unknown;
  executedBy?: unknown;
  executedByEmployeeId?: unknown;
  markedDoneBy?: unknown;
  markedDoneByEmployeeId?: unknown;
  doneBy?: unknown;
  doneByEmployeeId?: unknown;
};

type RateValue = { defaultPercent: number; overridePrice: number | null };

function normalizeEmployeeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object') {
    const objectValue = value as { _id?: unknown; id?: unknown };
    return normalizeEmployeeId(objectValue._id ?? objectValue.id);
  }
  return null;
}

function getExecutionUnitCompletedBy(unit: ExecutionUnitWithEmployee): string | null {
  return (
    normalizeEmployeeId(unit.completedBy) ??
    normalizeEmployeeId(unit.completedByEmployeeId) ??
    normalizeEmployeeId(unit.executedBy) ??
    normalizeEmployeeId(unit.executedByEmployeeId) ??
    normalizeEmployeeId(unit.markedDoneBy) ??
    normalizeEmployeeId(unit.markedDoneByEmployeeId) ??
    normalizeEmployeeId(unit.doneBy) ??
    normalizeEmployeeId(unit.doneByEmployeeId)
  );
}

function getInvoiceItemProductReference(item: InvoiceItemInput) {
  return (
    normalizeRefId(item.productId) ??
    normalizeRefId(item.product) ??
    normalizeRefId(item.cenikItemId) ??
    normalizeRefId(item.itemId)
  );
}

function getServiceWorkOrderItemsForProduct(workOrders: Array<Pick<WorkOrderDocument, 'items'>>, productId: string) {
  return workOrders.flatMap((order) =>
    (order.items ?? []).filter((item) => item.isService === true && item.productId && String(item.productId) === productId)
  );
}

function getMatchingServiceWorkOrderItems(
  workOrders: Array<Pick<WorkOrderDocument, 'items'>>,
  invoiceItem: InvoiceItemInput,
  productId: string | null
) {
  const invoiceItemId = normalizeRefId(invoiceItem.id);
  const invoiceName = normalizeText(invoiceItem.name);
  return workOrders.flatMap((order) =>
    (order.items ?? []).filter((item) => {
      if (item.isService !== true) return false;
      if (productId && item.productId && String(item.productId) === productId) return true;
      if (invoiceItemId && item.offerItemId && String(item.offerItemId) === invoiceItemId) return true;
      if (invoiceItemId && item.id && String(item.id) === invoiceItemId) return true;
      return Boolean(invoiceName && normalizeText(item.name) === invoiceName);
    })
  );
}

export async function createFinanceSnapshot(params: {
  project: ProjectInput;
  invoiceVersion: InvoiceVersionInput;
  correctedFromInvoiceVersionId?: string | null;
  actorUserId?: string | null;
}) {
  const { project, invoiceVersion, correctedFromInvoiceVersionId } = params;
  console.log('[Snapshot] Raw invoice version:', JSON.stringify(invoiceVersion, null, 2));
  console.log(
    '[Snapshot] Invoice items:',
    JSON.stringify(
      (invoiceVersion.items ?? []).map((item) => ({
        name: item.name,
        productId: item.productId,
        product: item.product,
        cenikItemId: item.cenikItemId,
        itemId: item.itemId,
        id: item.id,
        isService: (item as InvoiceItemInput & { isService?: unknown }).isService,
        quantity: item.quantity,
      })),
      null,
      2
    )
  );

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
    console.log('[Snapshot] FULL invoice item:', JSON.stringify(item, null, 2));
    const explicitProductId = getInvoiceItemProductReference(item);
    if (explicitProductId) return explicitProductId;

    const itemId = normalizeRefId(item.id);
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
  workOrders.forEach((workOrder) => {
    console.log(
      '[Snapshot] Work order items:',
      JSON.stringify(
        workOrder?.items?.map((item) => ({
          name: item.name,
          isService: item.isService,
          executionUnits: item.executionSpec?.executionUnits,
        }))
      )
    );
    (workOrder?.items ?? []).forEach((item) => {
      console.log('[Snapshot] FULL WO item:', JSON.stringify(item, null, 2));
    });
  });

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

  const employeeEarningsMap = new Map<string, number>();
  const rateByEmployeeProduct = new Map<string, RateValue | null>();

  const getRateForEmployeeProduct = async (employeeId: string, serviceProductId: string) => {
    const key = `${employeeId}:${serviceProductId}`;
    if (rateByEmployeeProduct.has(key)) {
      return rateByEmployeeProduct.get(key) ?? null;
    }
    console.log('[Snapshot] Looking up rate for employee:', employeeId, 'service:', serviceProductId);
    const rate = isObjectId(employeeId) && isObjectId(serviceProductId)
      ? await EmployeeServiceRateModel.findOne({
        employeeId,
        serviceProductId,
        isActive: true,
      }).lean()
      : null;
    console.log(
      '[Snapshot] Found rate:',
      rate
        ? {
            defaultPercent: rate.defaultPercent,
            overridePrice: rate.overridePrice,
          }
        : 'NOT FOUND'
    );
    const normalizedRate = rate
      ? {
          defaultPercent: toNumber(rate.defaultPercent, 0),
          overridePrice: rate.overridePrice === null || rate.overridePrice === undefined ? null : toNumber(rate.overridePrice, 0),
        }
      : null;
    rateByEmployeeProduct.set(key, normalizedRate);
    return normalizedRate;
  };

  const snapshotItems = (invoiceVersion.items ?? []).map((item, index) => {
    const resolvedProductId = resolvedProductIds[index];
    console.log('[Snapshot] Looking up product:', item.productId);
    console.log('[Snapshot] Resolved product reference:', {
      directProductId: item.productId,
      product: item.product,
      cenikItemId: item.cenikItemId,
      itemId: item.itemId,
      invoiceItemId: item.id,
      resolvedProductId,
    });
    const product = resolveProductForItem(item, index);
    console.log(
      '[Snapshot] Found product:',
      product
        ? {
            name: (product as typeof product & { name?: unknown; ime?: unknown }).name ?? product.ime,
            purchasePriceWithoutVat: product.purchasePriceWithoutVat,
            nabavnaCena: product.nabavnaCena,
          }
        : 'NOT FOUND'
    );
    const productId = product ? String(product._id) : resolvedProductId;
    const quantity = toNumber(item.quantity, 0);
    const unitPriceSale = toNumber(item.unitPrice, 0);
    const unitPricePurchase = getPurchasePrice(product);
    const totalSale = toNumber(item.totalWithoutVat, round(quantity * unitPriceSale));
    const totalPurchase = round(quantity * unitPricePurchase);
    const margin = round(totalSale - totalPurchase);
    const hasServiceWorkOrderItem = productId
      ? getMatchingServiceWorkOrderItems(workOrders as Array<Pick<WorkOrderDocument, 'items'>>, item, productId).length > 0
      : false;
    const isService = Boolean(product?.isService || hasServiceWorkOrderItem);

    if (!product) {
      console.warn('Purchase price not found for:', item.name);
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

  for (const snapshotItem of snapshotItems) {
    if (!snapshotItem.isService || !snapshotItem.productId) {
      continue;
    }

    const invoiceItem = (invoiceVersion.items ?? []).find((item) => item.name === snapshotItem.name) ?? null;
    workOrders.forEach((workOrder) => {
      console.log(
        '[Snapshot] Matching invoice item:',
        snapshotItem.name,
        'to WO items:',
        (workOrder.items ?? []).map((item) => item.name)
      );
    });
    const workOrderItems = invoiceItem
      ? getMatchingServiceWorkOrderItems(
          workOrders as Array<Pick<WorkOrderDocument, 'items'>>,
          invoiceItem,
          snapshotItem.productId
        )
      : getServiceWorkOrderItemsForProduct(
          workOrders as Array<Pick<WorkOrderDocument, 'items'>>,
          snapshotItem.productId
        );

    for (const workOrderItem of workOrderItems) {
      const executionUnits = workOrderItem.executionSpec?.executionUnits ?? [];
      console.log(
        '[Snapshot] Service item execution units:',
        JSON.stringify(
          executionUnits.map((unit) => ({
            id: unit.id,
            completedBy: (unit as ExecutionUnitWithEmployee).completedBy,
            completedByEmployeeId: (unit as ExecutionUnitWithEmployee).completedByEmployeeId,
            markedDoneBy: (unit as ExecutionUnitWithEmployee).markedDoneBy,
            doneBy: (unit as ExecutionUnitWithEmployee).doneBy,
          }))
        )
      );
      for (const unit of executionUnits as ExecutionUnitWithEmployee[]) {
        if (!unit.isCompleted) {
          continue;
        }

        const completedByEmployeeId = getExecutionUnitCompletedBy(unit);
        if (!completedByEmployeeId) {
          continue;
        }

        const rate = await getRateForEmployeeProduct(completedByEmployeeId, snapshotItem.productId);
        if (!rate) {
          console.warn(
            `Employee service rate not found for employee ${completedByEmployeeId} and service ${snapshotItem.productId}`
          );
          employeeEarningsMap.set(completedByEmployeeId, employeeEarningsMap.get(completedByEmployeeId) ?? 0);
          continue;
        }

        const earnings = rate.overridePrice ?? round(snapshotItem.unitPriceSale * (rate.defaultPercent / 100));
        employeeEarningsMap.set(completedByEmployeeId, round((employeeEarningsMap.get(completedByEmployeeId) ?? 0) + earnings));
      }
    }
  }

  const employeeEarningIds = Array.from(new Set([...assignedEmployeeIds, ...employeeEarningsMap.keys()]));

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
      name: optionalString(project.customer?.name),
      taxId: optionalString(project.customer?.taxId ?? project.customer?.davkaStevilka ?? project.customer?.vatNumber),
      address: optionalString(project.customer?.address),
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
    employeeEarnings: employeeEarningIds.map((employeeId) => ({
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

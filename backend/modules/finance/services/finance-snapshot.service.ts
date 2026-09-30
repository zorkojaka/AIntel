import { FilterQuery } from 'mongoose';
import { ProductModel } from '../../cenik/product.model';
import { WorkOrderModel, type WorkOrderDocument } from '../../projects/schemas/work-order';
import { ProjectModel } from '../../projects/schemas/project';
import { OfferVersionModel } from '../../projects/schemas/offer-version';
import { EmployeeServiceRateModel } from '../../employee-profiles/schemas/employee-service-rate';
import { EmployeeProfileModel } from '../../employee-profiles/schemas/employee-profile';
import { FinanceSnapshotModel, type FinanceSnapshotDocument } from '../schemas/finance-snapshot';
import { financeLedgerPipeline, listFinanceLedger } from './finance-ledger.service';

const financeSnapshotDebugEnabled =
  process.env.NODE_ENV !== 'production' && ['1', 'true', 'yes', 'on'].includes((process.env.AINTEL_FINANCE_DEBUG ?? '').trim().toLowerCase());

function debugSnapshotLog(...args: unknown[]) {
  if (financeSnapshotDebugEnabled) {
    console.log(...args);
  }
}

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
  invoiceNumber?: string | null;
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

function isLegacyCustomServiceName(value: unknown) {
  const name = normalizeText(value);
  return /^(montaža|demontaža|konfiguracija|rekonfiguracija|zagon|napeljava|polaganje|izrez|delovna ura|potni stroški)\b/.test(name);
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
    if (typeof (value as { toHexString?: unknown }).toHexString === 'function') {
      return (value as { toHexString: () => string }).toHexString();
    }
    const ref = value as { _id?: unknown; id?: unknown };
    const nestedValue = ref._id ?? ref.id;
    if (nestedValue && nestedValue !== value) {
      return normalizeRefId(nestedValue);
    }
    if (typeof (value as { toString?: unknown }).toString === 'function') {
      const stringValue = String(value);
      return stringValue && stringValue !== '[object Object]' ? stringValue : null;
    }
    return null;
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

function resolveAssignedEmployeeIds(
  workOrders: Array<Pick<WorkOrderDocument, 'assignedEmployeeIds' | 'mainInstallerId'>>
) {
  const ids = new Set<string>();
  workOrders.forEach((order) => {
    if (order.mainInstallerId) {
      ids.add(String(order.mainInstallerId));
    }
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

type ServiceWorkOrderItemWithCompletion = {
  isCompleted?: boolean;
  completedBy?: unknown;
  completedByEmployeeId?: unknown;
  executedBy?: unknown;
  executedByEmployeeId?: unknown;
  markedDoneBy?: unknown;
  markedDoneByEmployeeId?: unknown;
  doneBy?: unknown;
  doneByEmployeeId?: unknown;
  executedQuantity?: unknown;
  laborAllocations?: Array<{ id?: string; quantity?: unknown; assigneeId?: unknown; assigneeIds?: unknown }>;
};

type RateValue = { defaultPercent: number; overridePrice: number | null };
type RateLookupProduct = { productId: string; rateProductId: string };

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
    return null;
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

function getWorkOrderItemCompletedBy(item: ServiceWorkOrderItemWithCompletion): string | null {
  return (
    normalizeEmployeeId(item.completedBy) ??
    normalizeEmployeeId(item.completedByEmployeeId) ??
    normalizeEmployeeId(item.executedBy) ??
    normalizeEmployeeId(item.executedByEmployeeId) ??
    normalizeEmployeeId(item.markedDoneBy) ??
    normalizeEmployeeId(item.markedDoneByEmployeeId) ??
    normalizeEmployeeId(item.doneBy) ??
    normalizeEmployeeId(item.doneByEmployeeId)
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

async function resolveRateLookupProduct(serviceProductId: string): Promise<RateLookupProduct> {
  if (!isObjectId(serviceProductId)) {
    return { productId: serviceProductId, rateProductId: serviceProductId };
  }
  const product = await ProductModel.findById(serviceProductId).select('_id mergedIntoProductId isActive status').lean();
  const mergedIntoProductId = normalizeRefId((product as { mergedIntoProductId?: unknown } | null)?.mergedIntoProductId);
  return {
    productId: serviceProductId,
    rateProductId: mergedIntoProductId && isObjectId(mergedIntoProductId) ? mergedIntoProductId : serviceProductId,
  };
}

function getServiceWorkOrderItemsForProduct(workOrders: Array<Pick<WorkOrderDocument, 'items'>>, productId: string) {
  return workOrders.flatMap((order) =>
    (order.items ?? []).filter((item) => item.isService === true && item.productId && String(item.productId) === productId)
  );
}

function getMatchingServiceWorkOrderItems(
  workOrders: Array<Pick<WorkOrderDocument, 'items'>>,
  invoiceItem: InvoiceItemInput,
  productId: string | null,
  allowLegacyUnflaggedService = false,
) {
  const invoiceItemId = normalizeRefId(invoiceItem.id);
  const invoiceName = normalizeText(invoiceItem.name);
  return workOrders.flatMap((order) =>
    (order.items ?? []).filter((item) => {
      if (item.isService !== true && !allowLegacyUnflaggedService) return false;
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
  refreshSnapshotId?: string | null;
}) {
  const { project, invoiceVersion, correctedFromInvoiceVersionId, refreshSnapshotId } = params;
  debugSnapshotLog('[Snapshot] Raw invoice version:', JSON.stringify(invoiceVersion, null, 2));
  debugSnapshotLog(
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
  const offerItemIds = new Set<string>();
  const offerServiceItemIds = new Set<string>();
  const offerServiceNames = new Set<string>();
  (offer?.items ?? []).forEach((item) => {
    const itemId = normalizeId(item.id);
    const productId = normalizeId(item.productId);
    if (itemId) offerItemIds.add(itemId);
    if (itemId && productId) {
      offerProductIdByItemId.set(itemId, productId);
    }
    if (item.isService === true) {
      if (itemId) offerServiceItemIds.add(itemId);
      const itemName = normalizeText(item.name);
      if (itemName) offerServiceNames.add(itemName);
    }
  });

  const resolvedProductIds = (invoiceVersion.items ?? []).map((item) => {
    debugSnapshotLog('[Snapshot] FULL invoice item:', JSON.stringify(item, null, 2));
    const explicitProductId = getInvoiceItemProductReference(item);
    if (explicitProductId) return explicitProductId;

    const itemId = normalizeRefId(item.id);
    const offerProductId = itemId ? offerProductIdByItemId.get(itemId) : null;
    if (offerProductId) return offerProductId;

    // ID custom postavke je ID vrstice ponudbe, ne ID produkta iz cenika.
    if (itemId && offerItemIds.has(itemId)) return null;

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
    debugSnapshotLog(
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
      debugSnapshotLog('[Snapshot] FULL WO item:', JSON.stringify(item, null, 2));
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

  const assignedEmployeeIds = resolveAssignedEmployeeIds(
    workOrders as Array<Pick<WorkOrderDocument, 'assignedEmployeeIds' | 'mainInstallerId'>>
  );

  const employeeEarningsMap = new Map<string, number>();
  const rateByEmployeeProduct = new Map<string, RateValue | null>();
  const rateLookupProductByProductId = new Map<string, Promise<RateLookupProduct>>();
  const customServiceRateByEmployee = new Map<string, RateValue | null>();

  const getRateForEmployeeProduct = async (employeeId: string, serviceProductId: string) => {
    if (!rateLookupProductByProductId.has(serviceProductId)) {
      rateLookupProductByProductId.set(serviceProductId, resolveRateLookupProduct(serviceProductId));
    }
    const { rateProductId } = await rateLookupProductByProductId.get(serviceProductId)!;
    const key = `${employeeId}:${rateProductId}`;
    if (rateByEmployeeProduct.has(key)) {
      return rateByEmployeeProduct.get(key) ?? null;
    }
    debugSnapshotLog('[Snapshot] Looking up rate for employee:', employeeId, 'service:', serviceProductId, 'rateProduct:', rateProductId);
    const rate = isObjectId(employeeId) && isObjectId(rateProductId)
      ? await EmployeeServiceRateModel.findOne({
        employeeId,
        serviceProductId: rateProductId,
        isActive: true,
      }).lean()
      : null;
    debugSnapshotLog(
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

  const getRateForCustomService = async (employeeId: string) => {
    if (customServiceRateByEmployee.has(employeeId)) {
      return customServiceRateByEmployee.get(employeeId) ?? null;
    }
    const profile = isObjectId(employeeId)
      ? await EmployeeProfileModel.findOne({ employeeId }).select('profitSharePercent').lean()
      : null;
    const rate = profile
      ? { defaultPercent: toNumber(profile.profitSharePercent, 0), overridePrice: null }
      : null;
    customServiceRateByEmployee.set(employeeId, rate);
    return rate;
  };

  const getEffectiveServiceRate = async (employeeId: string, serviceProductId: string | null) => {
    if (serviceProductId) {
      const configuredRate = await getRateForEmployeeProduct(employeeId, serviceProductId);
      if (configuredRate) return configuredRate;
    }
    return getRateForCustomService(employeeId);
  };

  const snapshotItems = (invoiceVersion.items ?? []).map((item, index) => {
    const resolvedProductId = resolvedProductIds[index];
    debugSnapshotLog('[Snapshot] Looking up product:', item.productId);
    debugSnapshotLog('[Snapshot] Resolved product reference:', {
      directProductId: item.productId,
      product: item.product,
      cenikItemId: item.cenikItemId,
      itemId: item.itemId,
      invoiceItemId: item.id,
      resolvedProductId,
    });
    const product = resolveProductForItem(item, index);
    debugSnapshotLog(
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
    const invoiceItemId = normalizeRefId(item.id);
    const isConfirmedOfferService = Boolean(
      (invoiceItemId && offerServiceItemIds.has(invoiceItemId)) || offerServiceNames.has(normalizeText(item.name)),
    );
    const isLegacyCustomService = !productId && isLegacyCustomServiceName(item.name);
    const allowUnflaggedService = isConfirmedOfferService || isLegacyCustomService;
    const hasServiceWorkOrderItem = getMatchingServiceWorkOrderItems(
      workOrders as Array<Pick<WorkOrderDocument, 'items'>>,
      item,
      productId,
      allowUnflaggedService,
    ).length > 0;
    const isService = Boolean(product?.isService || isConfirmedOfferService || isLegacyCustomService || hasServiceWorkOrderItem);

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
    if (!snapshotItem.isService) {
      continue;
    }

    let serviceLaborPurchaseTotal = 0;
    const invoiceItem = (invoiceVersion.items ?? []).find((item) => item.name === snapshotItem.name) ?? null;
    workOrders.forEach((workOrder) => {
      debugSnapshotLog(
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
          snapshotItem.productId,
          snapshotItem.isService,
        )
      : getServiceWorkOrderItemsForProduct(
          workOrders as Array<Pick<WorkOrderDocument, 'items'>>,
          snapshotItem.productId ?? ''
        );

    for (const workOrderItem of workOrderItems) {
      const laborAllocations = Array.isArray((workOrderItem as ServiceWorkOrderItemWithCompletion).laborAllocations)
        ? (workOrderItem as ServiceWorkOrderItemWithCompletion).laborAllocations ?? [] : [];
      if (laborAllocations.length > 0) {
        for (const allocation of laborAllocations) {
          const quantity = Math.max(0, toNumber(allocation.quantity, 0));
          const assigneeId = normalizeEmployeeId(allocation.assigneeId);
          const selectedSharedRecipients = Array.isArray(allocation.assigneeIds)
            ? allocation.assigneeIds.map((employeeId) => normalizeEmployeeId(employeeId)).filter((employeeId): employeeId is string => !!employeeId)
            : [];
          const recipients = assigneeId === 'shared' || String(allocation.assigneeId) === 'shared'
            ? (selectedSharedRecipients.length > 0 ? selectedSharedRecipients : assignedEmployeeIds) : assigneeId ? [assigneeId] : [];
          if (quantity <= 0 || recipients.length === 0) continue;
          for (const employeeId of recipients) {
            const rate = await getEffectiveServiceRate(employeeId, snapshotItem.productId);
            if (!rate) continue;
            const perUnitEarnings = rate.overridePrice ?? round(snapshotItem.unitPriceSale * (rate.defaultPercent / 100));
            const divisor = String(allocation.assigneeId) === 'shared' ? recipients.length : 1;
            const earnings = round((perUnitEarnings * quantity) / divisor);
            serviceLaborPurchaseTotal = round(serviceLaborPurchaseTotal + earnings);
            employeeEarningsMap.set(employeeId, round((employeeEarningsMap.get(employeeId) ?? 0) + earnings));
          }
        }
        continue;
      }
      const executionUnits = workOrderItem.executionSpec?.executionUnits ?? [];
      debugSnapshotLog(
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
      if (executionUnits.length === 0) {
        const completedByEmployeeId = getWorkOrderItemCompletedBy(workOrderItem as ServiceWorkOrderItemWithCompletion);
        debugSnapshotLog('[Snapshot] Service item completed by:', {
          name: workOrderItem.name,
          isCompleted: workOrderItem.isCompleted,
          completedByEmployeeId,
          executedQuantity: workOrderItem.executedQuantity,
        });
        const recipients = completedByEmployeeId && assignedEmployeeIds.includes(completedByEmployeeId)
          ? [completedByEmployeeId]
          : assignedEmployeeIds;
        if (recipients.length === 0) {
          continue;
        }

        const executedQuantity = Math.max(1, toNumber(workOrderItem.executedQuantity, snapshotItem.quantity));
        for (const employeeId of recipients) {
          const rate = await getEffectiveServiceRate(employeeId, snapshotItem.productId);
          if (!rate) {
            console.warn(
              `Employee service rate not found for employee ${employeeId} and service ${snapshotItem.productId ?? 'custom'}`
            );
            employeeEarningsMap.set(employeeId, employeeEarningsMap.get(employeeId) ?? 0);
            continue;
          }

          const perUnitEarnings = rate.overridePrice ?? round(snapshotItem.unitPriceSale * (rate.defaultPercent / 100));
          const earnings = round((perUnitEarnings * executedQuantity) / recipients.length);
          serviceLaborPurchaseTotal = round(serviceLaborPurchaseTotal + earnings);
          employeeEarningsMap.set(employeeId, round((employeeEarningsMap.get(employeeId) ?? 0) + earnings));
        }
        continue;
      }
      for (const unit of executionUnits as ExecutionUnitWithEmployee[]) {
        if (!unit.isCompleted) {
          continue;
        }

        const completedByEmployeeId = getExecutionUnitCompletedBy(unit);
        if (!completedByEmployeeId) {
          continue;
        }

        const rate = await getEffectiveServiceRate(completedByEmployeeId, snapshotItem.productId);
        if (!rate) {
          console.warn(
            `Employee service rate not found for employee ${completedByEmployeeId} and service ${snapshotItem.productId ?? 'custom'}`
          );
          employeeEarningsMap.set(completedByEmployeeId, employeeEarningsMap.get(completedByEmployeeId) ?? 0);
          continue;
        }

        const earnings = rate.overridePrice ?? round(snapshotItem.unitPriceSale * (rate.defaultPercent / 100));
        serviceLaborPurchaseTotal = round(serviceLaborPurchaseTotal + earnings);
        employeeEarningsMap.set(completedByEmployeeId, round((employeeEarningsMap.get(completedByEmployeeId) ?? 0) + earnings));
      }
    }

    snapshotItem.totalPurchase = round(serviceLaborPurchaseTotal);
    snapshotItem.unitPricePurchase = snapshotItem.quantity > 0 ? round(serviceLaborPurchaseTotal / snapshotItem.quantity) : round(serviceLaborPurchaseTotal);
    snapshotItem.margin = round(snapshotItem.totalSale - snapshotItem.totalPurchase);
  }

  const employeeEarningIds = Array.from(new Set([...assignedEmployeeIds, ...employeeEarningsMap.keys()]));

  const totalSaleWithoutVat = round(snapshotItems.reduce((sum, item) => sum + item.totalSale, 0));
  const totalPurchase = round(snapshotItems.reduce((sum, item) => sum + item.totalPurchase, 0));
  const totalMargin = round(totalSaleWithoutVat - totalPurchase);
  const totalVat = round((invoiceVersion.summary?.vatAmount ?? 0) as number);
  const totalSaleWithVat = round((invoiceVersion.summary?.totalWithVat ?? totalSaleWithoutVat + totalVat) as number);

  if (refreshSnapshotId) {
    const existing = await FinanceSnapshotModel.findOne({
      _id: refreshSnapshotId,
      projectId: project.id,
      invoiceVersionId: invoiceVersion._id,
      superseded: { $ne: true },
    });
    if (!existing) return null;

    const previousEarningsByEmployeeId = new Map<string, { isPaid: boolean; paidAt: Date | null; paidBy: string | null }>(
      (existing.employeeEarnings ?? []).map((earning) => [String(earning.employeeId), {
        isPaid: Boolean(earning.isPaid),
        paidAt: earning.paidAt ?? null,
        paidBy: earning.paidBy ?? null,
      }]),
    );
    const refreshedEmployeeIds = Array.from(new Set([...assignedEmployeeIds, ...employeeEarningsMap.keys()]));
    existing.items = snapshotItems as any;
    existing.summary = { totalSaleWithoutVat, totalPurchase, totalMargin, totalVat, totalSaleWithVat };
    existing.assignedEmployeeIds = assignedEmployeeIds;
    existing.employeeEarnings = refreshedEmployeeIds.map((employeeId) => {
      const previous = previousEarningsByEmployeeId.get(employeeId);
      return {
        employeeId,
        earnings: round(employeeEarningsMap.get(employeeId) ?? 0),
        isPaid: previous?.isPaid ?? false,
        paidAt: previous?.paidAt ?? null,
        paidBy: previous?.paidBy ?? null,
      };
    }) as any;
    await existing.save();
    return existing;
  }

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
    invoiceNumber: invoiceVersion.invoiceNumber || `${project.id}-${invoiceVersion.versionNumber}`,
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

export async function refreshFinanceSnapshotLaborAllocation(projectId: string) {
  const [project, snapshots] = await Promise.all([
    ProjectModel.findOne({ id: projectId }).lean(),
    FinanceSnapshotModel.find({ projectId, superseded: { $ne: true } }).lean(),
  ]);
  if (!project || snapshots.length === 0) return [];

  const invoiceVersions = Array.isArray((project as { invoiceVersions?: unknown[] }).invoiceVersions)
    ? (project as { invoiceVersions: any[] }).invoiceVersions
    : [];
  const refreshed = [];
  for (const snapshot of snapshots) {
    const invoiceVersion = invoiceVersions.find((version) => String(version?._id) === String(snapshot.invoiceVersionId));
    if (!invoiceVersion) continue;
    const updated = await createFinanceSnapshot({
      project: {
        id: project.id,
        customer: project.customer,
        confirmedOfferVersionId: project.confirmedOfferVersionId ? String(project.confirmedOfferVersionId) : null,
        salesUserId: project.salesUserId ? String(project.salesUserId) : null,
      },
      invoiceVersion: invoiceVersion as InvoiceVersionInput,
      refreshSnapshotId: String(snapshot._id),
    });
    if (updated) refreshed.push(updated);
  }
  return refreshed;
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

  const [result] = await FinanceSnapshotModel.aggregate([
    ...financeLedgerPipeline(filter),
    { $facet: {
      count: [{ $count: 'total' }],
      rows: [{ $sort: { issuedAt: -1, createdAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
    } },
  ]);
  return { total: result?.count[0]?.total ?? 0, page, limit, items: result?.rows ?? [] };
}

export async function getProjectSnapshot(projectId: string) {
  const snapshot = await FinanceSnapshotModel.findOne({ projectId, superseded: { $ne: true } })
    .sort({ issuedAt: -1, createdAt: -1 })
    .lean();
  if (!snapshot) return null;
  const entries = await listFinanceLedger({ projectId });
  const netSummary = Object.fromEntries(Object.keys(snapshot.summary).map((key) => [key,
    Math.round(entries.reduce((sum, entry) => sum + Number(entry.summary[key] ?? 0), 0) * 100) / 100,
  ]));
  return { ...snapshot, netSummary, creditNotes: (snapshot.creditNotes ?? []).map(({ finance, requestId, payloadHash, ...note }) => note) };
}

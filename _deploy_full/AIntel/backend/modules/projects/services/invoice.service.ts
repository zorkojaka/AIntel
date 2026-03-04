import { Types } from 'mongoose';
import { ProjectModel, type Project, type ProjectDocument, addTimeline, type ProjectStatus } from '../schemas/project';
import { WorkOrderModel } from '../schemas/work-order';
import { OfferVersionModel } from '../schemas/offer-version';
import type { OfferLineItem } from '../../../../shared/types/offers';
import {
  financeEntries,
  nextFinanceId,
  type FinanceEntry,
} from '../../finance/schemas/financeEntry';

type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
type InvoiceItemType = 'Osnovno' | 'Dodatno' | 'Manj';

interface InvoiceItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  totalWithoutVat: number;
  totalWithVat: number;
  type: InvoiceItemType;
}

interface InvoiceItemPayload {
  id?: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  type: InvoiceItemType;
}

interface InvoiceSummary {
  baseWithoutVat: number;
  discountedBase: number;
  vatAmount: number;
  totalWithVat: number;
}

interface InvoiceVersion {
  _id: string;
  versionNumber: number;
  status: InvoiceStatus;
  createdAt: string;
  issuedAt: string | null;
  items: InvoiceItem[];
  summary: InvoiceSummary;
}

interface InvoiceListResponse {
  versions: InvoiceVersion[];
  activeVersionId: string | null;
  updatedVersion?: InvoiceVersion;
  projectStatus?: ProjectStatus;
}

function round(value: number) {
  return Number(Number(value).toFixed(2));
}

function resolveProjectId(projectId?: string) {
  return (projectId ?? '').trim();
}

async function findProjectOrFail(projectId: string) {
  const normalizedId = resolveProjectId(projectId);
  if (!normalizedId) {
    throw new Error('Manjka ID projekta.');
  }
  const project = await ProjectModel.findOne({ id: normalizedId });
  if (!project) {
    throw new Error('Projekt ni najden.');
  }
  if (!project.invoiceVersions) {
    project.invoiceVersions = [];
  }
  return project;
}

function sanitizeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectActiveVersionId(versions: InvoiceVersion[]): string | null {
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const latestDraft = [...sorted].reverse().find((version) => version.status === 'draft');
  if (latestDraft) return latestDraft._id;
  if (sorted.length === 0) return null;
  return sorted[sorted.length - 1]._id;
}

function serializeResponse(project: Project | ProjectDocument): InvoiceListResponse {
  const plain = 'toObject' in project ? (project as any).toObject() : (project as Project);
  const versions = [...(plain.invoiceVersions ?? [])].sort((a, b) => a.versionNumber - b.versionNumber);
  return {
    versions,
    activeVersionId: selectActiveVersionId(versions),
  };
}

function findDraftVersion(project: ProjectDocument): InvoiceVersion | null {
  return (project.invoiceVersions ?? []).find((version) => version.status === 'draft') ?? null;
}

async function buildConfirmedOfferIndex(project: ProjectDocument) {
  const projectId = project.id;
  const offerId = (project.confirmedOfferVersionId ?? '').trim();
  if (!offerId) {
    return {
      itemsById: new Map<string, OfferLineItem>(),
      itemsByProductId: new Map<string, OfferLineItem>(),
    };
  }
  const offer = await OfferVersionModel.findOne({ _id: offerId, projectId }).lean();
  if (!offer) {
    return {
      itemsById: new Map<string, OfferLineItem>(),
      itemsByProductId: new Map<string, OfferLineItem>(),
    };
  }
  const itemsById = new Map<string, OfferLineItem>();
  const itemsByProductId = new Map<string, OfferLineItem>();
  for (const item of offer.items ?? []) {
    if (item?.id) {
      itemsById.set(item.id, item);
    }
    if (item?.productId) {
      itemsByProductId.set(item.productId, item);
    }
  }
  return { itemsById, itemsByProductId };
}

async function aggregateClosingItems(project: ProjectDocument): Promise<InvoiceItemPayload[]> {
  const projectId = project.id;
  const workOrders = await WorkOrderModel.find({ projectId }).lean();
  const offerIndex = await buildConfirmedOfferIndex(project);
  const grouped = new Map<
    string,
    {
      name: string;
      unit: string;
      offered: number;
      executed: number;
      isExtra: boolean;
      offerItemId?: string | null;
      productId?: string | null;
    }
  >();

  workOrders.forEach((order) => {
    (order.items ?? []).forEach((item) => {
      const offered = toNumber(item.offeredQuantity, 0);
      const executed = toNumber(item.executedQuantity, 0);
      const groupKey =
        item.offerItemId && item.offerItemId.length > 0
          ? `offer:${item.offerItemId}`
          : item.productId && item.productId.length > 0
            ? `product:${item.productId}`
            : `custom:${sanitizeText(item.name, '')}:${sanitizeText(item.unit, '')}`;
      const offerItemId = typeof item.offerItemId === 'string' && item.offerItemId.length > 0 ? item.offerItemId : null;
      const productId = typeof item.productId === 'string' && item.productId.length > 0 ? item.productId : null;
      const current =
        grouped.get(groupKey) ??
        {
          name: sanitizeText(item.name, ''),
          unit: sanitizeText(item.unit, ''),
          offered: 0,
          executed: 0,
          isExtra: false,
          offerItemId,
          productId,
        };
      grouped.set(groupKey, {
        name: sanitizeText(current.name || item.name, 'Neimenovana postavka'),
        unit: sanitizeText(current.unit || item.unit, ''),
        offered: current.offered + offered,
        executed: current.executed + executed,
        isExtra: current.isExtra || !!item.isExtra || offered === 0,
        offerItemId: current.offerItemId ?? offerItemId,
        productId: current.productId ?? productId,
      });
    });
  });

  const invoiceItems: InvoiceItemPayload[] = [];
  grouped.forEach((entry) => {
    let type: InvoiceItem['type'] = 'Osnovno';
    if (entry.isExtra || entry.offered === 0) {
      type = 'Dodatno';
    } else if (entry.executed < entry.offered) {
      type = 'Manj';
    }
    const matchedOfferItem =
      (entry.offerItemId && offerIndex.itemsById.get(entry.offerItemId)) ||
      (entry.productId && offerIndex.itemsByProductId.get(entry.productId)) ||
      null;
    const unitPrice = matchedOfferItem ? toNumber(matchedOfferItem.unitPrice, 0) : 0;
    const vatPercent = matchedOfferItem ? toNumber(matchedOfferItem.vatRate, 22) : 22;
    invoiceItems.push({
      name: entry.name || 'Neimenovana postavka',
      unit: entry.unit || '',
      quantity: entry.executed,
      unitPrice,
      vatPercent,
      type,
    });
  });

  return invoiceItems;
}

function ensureInvoiceVersion(project: ProjectDocument, versionId: string): InvoiceVersion {
  const version = (project.invoiceVersions ?? []).find((entry) => entry._id === versionId);
  if (!version) {
    throw new Error('Verzija računa ni najdena.');
  }
  return version as InvoiceVersion;
}

function resolveNextVersionNumber(project: ProjectDocument) {
  const versions = project.invoiceVersions ?? [];
  const maxNumber = versions.reduce((max, version) => Math.max(max, version.versionNumber ?? 0), 0);
  return maxNumber + 1;
}

export async function getInvoiceVersions(projectId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  return serializeResponse(project);
}

export async function createInvoiceFromClosing(projectId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const existingDraft = findDraftVersion(project);
  if (existingDraft) {
    return buildInvoiceResponse(project, { activeVersionId: existingDraft._id, updatedVersionId: existingDraft._id });
  }
  const sourceItems = await aggregateClosingItems(project);
  const { items, summary } = recalculateItems(sourceItems);
  const version: InvoiceVersion = {
    _id: new Types.ObjectId().toString(),
    versionNumber: resolveNextVersionNumber(project),
    status: 'draft',
    createdAt: new Date().toISOString(),
    issuedAt: null,
    items,
    summary,
  };
  project.invoiceVersions = [...(project.invoiceVersions ?? []), version];
  markInvoiceVersionsModified(project);
  await project.save();
  return buildInvoiceResponse(project, { activeVersionId: version._id, updatedVersionId: version._id });
}

export async function updateInvoiceVersion(projectId: string, versionId: string, payload: { items: InvoiceItemPayload[] }): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const version = ensureInvoiceVersion(project, versionId);
  if (version.status === 'issued') {
    throw new Error('Izdane verzije ni mogoče urejati.');
  }
  const inputItems = Array.isArray(payload?.items) ? payload.items : [];
  const { items, summary } = recalculateItems(inputItems);
  version.items = items;
  version.summary = summary;
  markInvoiceVersionsModified(project);
  await project.save();
  return serializeResponse(project);
}

export async function issueInvoiceVersion(projectId: string, versionId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const version = ensureInvoiceVersion(project, versionId);
  const previousStatus = version.status;
  if (version.status === 'issued') {
    console.log('[invoice] issue skipped', {
      projectId,
      invoiceVersionId: versionId,
      previousStatus,
      nextStatus: version.status,
      financeEntryCreated: false,
      reason: 'already-issued',
    });
    return buildInvoiceResponse(project, { activeVersionId: version._id, updatedVersionId: version._id, includeProjectStatus: true });
  }
  (project.invoiceVersions ?? []).forEach((entry) => {
    if (entry._id !== version._id && entry.status === 'issued') {
      entry.status = 'cancelled';
    }
  });
  version.status = 'issued';
  version.issuedAt = new Date().toISOString();
  markInvoiceVersionsModified(project);
  let financeEntryCreated = false;
  try {
    financeEntryCreated = recordFinanceEntryForInvoice(project, version);
  } catch (error) {
    console.error('[invoice] finance-entry failed', {
      projectId,
      invoiceVersionId: versionId,
      error,
    });
  }
  if (project.status !== 'completed') {
    const executionCompleted = await hasCompletedExecution(project.id);
    if (executionCompleted) {
      project.status = 'completed';
      addTimeline(project, {
        type: 'status-change',
        title: 'Status spremenjen',
        description: "Projekt prešel v fazo 'Zaključen' po izdaji računa",
        timestamp: new Date().toISOString(),
        user: 'system',
      });
    }
  }

  await project.save();
  console.log('[invoice] issue success', {
    projectId,
    invoiceVersionId: versionId,
    previousStatus,
    nextStatus: version.status,
    financeEntryCreated,
  });
  return buildInvoiceResponse(project, { activeVersionId: version._id, updatedVersionId: version._id, includeProjectStatus: true });
}

export async function cloneInvoiceVersion(projectId: string, versionId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const version = ensureInvoiceVersion(project, versionId);
  const existingDraft = findDraftVersion(project);
  if (existingDraft) {
    return buildInvoiceResponse(project, { activeVersionId: existingDraft._id, updatedVersionId: existingDraft._id });
  }
  if (version.status !== 'issued') {
    return buildInvoiceResponse(project, { activeVersionId: version._id, updatedVersionId: version._id });
  }
  (project.invoiceVersions ?? []).forEach((entry) => {
    if (entry._id !== version._id && entry.status === 'issued') {
      entry.status = 'cancelled';
    }
  });
  version.status = 'cancelled';
  const clonedItems = (version.items ?? []).map((item) => ({ ...item }));
  const clone: InvoiceVersion = {
    _id: new Types.ObjectId().toString(),
    versionNumber: resolveNextVersionNumber(project),
    status: 'draft',
    createdAt: new Date().toISOString(),
    issuedAt: null,
    items: clonedItems,
    summary: { ...version.summary },
  };
  project.invoiceVersions = [...(project.invoiceVersions ?? []), clone];
  markInvoiceVersionsModified(project);
  await project.save();
  return buildInvoiceResponse(project, { activeVersionId: clone._id, updatedVersionId: clone._id });
}
function recalculateItems(items: InvoiceItemPayload[]) {
  const updatedItems: InvoiceItem[] = items.map((item) => {
    const quantity = toNumber(item.quantity, 0);
    const unitPrice = toNumber(item.unitPrice, 0);
    const vatPercent = toNumber(item.vatPercent, 0);
    const totalWithoutVat = round(quantity * unitPrice);
    const vatAmount = round(totalWithoutVat * (vatPercent / 100));
    const totalWithVat = round(totalWithoutVat + vatAmount);

    return {
      id: item.id ?? new Types.ObjectId().toString(),
      name: sanitizeText(item.name, 'Neimenovana postavka'),
      unit: sanitizeText(item.unit, ''),
      quantity,
      unitPrice,
      vatPercent,
      totalWithoutVat,
      totalWithVat,
      type: item.type === 'Dodatno' || item.type === 'Manj' ? item.type : 'Osnovno',
    };
  });

  const baseWithoutVat = round(updatedItems.reduce((sum, current) => sum + current.totalWithoutVat, 0));
  const vatAmount = round(
    updatedItems.reduce((sum, current) => sum + (current.totalWithVat - current.totalWithoutVat), 0),
  );
  const totalWithVat = round(updatedItems.reduce((sum, current) => sum + current.totalWithVat, 0));

  return {
    items: updatedItems,
    summary: {
      baseWithoutVat,
      discountedBase: baseWithoutVat,
      vatAmount,
      totalWithVat,
    },
  };
}

interface InvoiceResponseOverrides {
  activeVersionId?: string | null;
  updatedVersionId?: string | null;
  includeProjectStatus?: boolean;
}

function buildInvoiceResponse(project: ProjectDocument, overrides: InvoiceResponseOverrides = {}): InvoiceListResponse {
  const response = serializeResponse(project);
  const payload: InvoiceListResponse = { ...response };
  if (overrides.activeVersionId !== undefined) {
    payload.activeVersionId = overrides.activeVersionId;
  }
  if (overrides.updatedVersionId) {
    const located =
      payload.versions.find((entry) => entry._id === overrides.updatedVersionId) ??
      (project.invoiceVersions ?? []).find((entry) => entry._id === overrides.updatedVersionId);
    if (located) {
      payload.updatedVersion = JSON.parse(JSON.stringify(located)) as InvoiceVersion;
    }
  }
  if (overrides.includeProjectStatus) {
    payload.projectStatus = project.status;
  }
  return payload;
}

function markInvoiceVersionsModified(project: ProjectDocument) {
  if (typeof project.markModified === 'function') {
    project.markModified('invoiceVersions');
  }
}

function recordFinanceEntryForInvoice(project: ProjectDocument, version: InvoiceVersion) {
  if (!version.issuedAt) {
    return false;
  }
  const existingEntry = financeEntries.find((entry) => entry.id_racuna === version._id);
  if (existingEntry) {
    return false;
  }

  const summary = version.summary ?? {
    baseWithoutVat: 0,
    discountedBase: 0,
    vatAmount: 0,
    totalWithVat: 0,
  };
  const netAmount = summary.baseWithoutVat ?? summary.discountedBase ?? 0;
  const entry: FinanceEntry = {
    id: nextFinanceId(),
    id_projekta: project.id,
    id_racuna: version._id,
    datum_izdaje: new Date(version.issuedAt).toISOString().slice(0, 10),
    znesek_skupaj: summary.totalWithVat ?? 0,
    ddv: summary.vatAmount ?? 0,
    znesek_brez_ddv: netAmount,
    nabavna_vrednost: 0,
    dobicek: netAmount,
    stranka: project.customer?.name ?? 'Stranka',
    artikli: (version.items ?? []).map((item) => ({
      naziv: item.name,
      kolicina: item.quantity,
      cena_nabavna: 0,
      cena_prodajna: item.totalWithVat ?? item.totalWithoutVat ?? 0,
    })),
    kategorija_prihodka: 'storitev',
    oznaka: 'čaka na plačilo',
  };
  financeEntries.push(entry);
  return true;
}

function normalizeWorkOrderStatus(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function hasCompletedExecution(projectId: string) {
  const workOrders = await WorkOrderModel.find({ projectId }).lean();
  if (!workOrders.length) {
    return false;
  }
  const issuedLikeStatuses = new Set(['issued', 'in-progress', 'confirmed', 'completed']);
  const issuedOrders = workOrders.filter((order) => issuedLikeStatuses.has(normalizeWorkOrderStatus((order as any)?.status)));
  if (!issuedOrders.length) {
    return false;
  }
  return issuedOrders.every((order) => normalizeWorkOrderStatus((order as any)?.status) === 'completed');
}

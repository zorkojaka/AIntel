import { Types } from 'mongoose';
import { ProjectModel, type Project, type ProjectDocument, addTimeline, type ProjectStatus } from '../schemas/project';
import { WorkOrderModel } from '../schemas/work-order';
import { OfferVersionModel } from '../schemas/offer-version';
import type { OfferLineItem } from '../../../../shared/types/offers';
import { createFinanceSnapshot } from '../../finance/services/finance-snapshot.service';
import { FinanceSnapshotModel } from '../../finance/schemas/finance-snapshot';
import {
  generateInvoiceSequentialNumber,
  parseInvoiceSequentialNumber,
  previewInvoiceSequentialNumber,
  syncInvoiceSequentialCounterAtLeast,
} from './document-numbering.service';

type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
type InvoiceItemType = 'Osnovno' | 'Dodatno' | 'Manj';

interface InvoiceItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
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
  discountPercent?: number;
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
  invoiceNumber?: string | null;
  invoiceSequence?: number | null;
  status: InvoiceStatus;
  createdAt: string;
  issuedAt: string | null;
  servicePerformedAt?: string | null;
  correctedFromInvoiceVersionId?: string | null;
  discountPercent: number;
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
  items: InvoiceItem[];
  summary: InvoiceSummary;
}

interface InvoiceListResponse {
  versions: InvoiceVersion[];
  activeVersionId: string | null;
  updatedVersion?: InvoiceVersion;
  projectStatus?: ProjectStatus;
  nextInvoiceNumber?: string;
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

async function assertInvoiceNumberAvailable(invoiceNumber: string, currentVersionId: string, allowedVersionIds: string[] = []) {
  const allowedIds = Array.from(new Set([currentVersionId, ...allowedVersionIds].filter(Boolean)));
  const [existingSnapshot, existingProject] = await Promise.all([
    FinanceSnapshotModel.findOne({ invoiceNumber, invoiceVersionId: { $nin: allowedIds } }).select({ _id: 1 }).lean(),
    ProjectModel.findOne({
      invoiceVersions: {
        $elemMatch: {
          invoiceNumber,
          _id: { $nin: allowedIds },
        },
      },
    }).select({ id: 1 }).lean(),
  ]);

  if (existingSnapshot || existingProject) {
    throw new Error(`Številka računa ${invoiceNumber} je že uporabljena.`);
  }
}

function getInvoiceCorrectionChainIds(versions: InvoiceVersion[], version: InvoiceVersion) {
  const byId = new Map(versions.map((entry) => [entry._id, entry]));
  const allowed = new Set<string>([version._id]);

  let parentId = version.correctedFromInvoiceVersionId ?? null;
  while (parentId && byId.has(parentId) && !allowed.has(parentId)) {
    allowed.add(parentId);
    parentId = byId.get(parentId)?.correctedFromInvoiceVersionId ?? null;
  }

  let changed = true;
  while (changed) {
    changed = false;
    versions.forEach((entry) => {
      if (entry.correctedFromInvoiceVersionId && allowed.has(entry.correctedFromInvoiceVersionId) && !allowed.has(entry._id)) {
        allowed.add(entry._id);
        changed = true;
      }
    });
  }

  return Array.from(allowed);
}

async function resolveInvoiceNumberForIssue(
  version: InvoiceVersion,
  issuedAt: Date,
  override?: unknown,
  allowedVersionIds: string[] = [],
) {
  const normalizedOverride = typeof override === 'string' ? override.trim() : '';
  if (version.correctedFromInvoiceVersionId && version.invoiceNumber) {
    const correctionNumber = version.invoiceNumber.trim();
    if (normalizedOverride && normalizedOverride !== correctionNumber) {
      throw new Error('Popravek računa mora ohraniti isto številko računa.');
    }
    await assertInvoiceNumberAvailable(correctionNumber, version._id, allowedVersionIds);
    const parsed = parseInvoiceSequentialNumber(correctionNumber);
    return {
      invoiceNumber: correctionNumber,
      invoiceSequence: parsed?.sequence ?? version.invoiceSequence ?? null,
    };
  }
  if (normalizedOverride) {
    const parsed = parseInvoiceSequentialNumber(normalizedOverride);
    if (!parsed) {
      throw new Error('Številka računa mora biti v obliki zaporedna/mesec/leto, npr. 50/6/2026.');
    }
    if (parsed.month !== issuedAt.getMonth() + 1 || parsed.year !== issuedAt.getFullYear()) {
      throw new Error(`Številka računa mora imeti trenutni mesec in leto izdaje (${issuedAt.getMonth() + 1}/${issuedAt.getFullYear()}).`);
    }
    await assertInvoiceNumberAvailable(parsed.number, version._id, allowedVersionIds);
    await syncInvoiceSequentialCounterAtLeast(parsed.sequence, parsed.year, issuedAt);
    return { invoiceNumber: parsed.number, invoiceSequence: parsed.sequence };
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const generated = await generateInvoiceSequentialNumber(issuedAt);
    try {
      await assertInvoiceNumberAvailable(generated.number, version._id, allowedVersionIds);
      return { invoiceNumber: generated.number, invoiceSequence: generated.sequence };
    } catch (error) {
      if (attempt === 9) throw error;
    }
  }

  throw new Error('Naslednje številke računa ni mogoče določiti.');
}

async function buildConfirmedOfferIndex(project: ProjectDocument) {
  const projectId = project.id;
  const offerId = (project.confirmedOfferVersionId ?? '').trim();
  if (!offerId) {
    return {
      offer: null,
      itemsById: new Map<string, OfferLineItem>(),
      itemsByProductId: new Map<string, OfferLineItem>(),
    };
  }
  const offer = await OfferVersionModel.findOne({ _id: offerId, projectId }).lean();
  if (!offer) {
    return {
      offer: null,
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
  return { offer, itemsById, itemsByProductId };
}

async function aggregateClosingItems(project: ProjectDocument): Promise<{
  items: InvoiceItemPayload[];
  discountPercent: number;
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
  vatMode: number | null;
}> {
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
    const offerVatMode = offerIndex.offer ? toNumber(offerIndex.offer.vatMode, 22) : null;
    const vatPercent = offerVatMode ?? (matchedOfferItem ? toNumber(matchedOfferItem.vatRate, 22) : 22);
    invoiceItems.push({
      id: entry.offerItemId ?? entry.productId ?? `${entry.name}:${entry.unit}:${type}`,
      name: entry.name || 'Neimenovana postavka',
      unit: entry.unit || '',
      quantity: entry.executed,
      unitPrice,
      discountPercent: matchedOfferItem ? toNumber(matchedOfferItem.discountPercent, 0) : 0,
      vatPercent,
      type,
    });
  });

  return {
    items: invoiceItems,
    discountPercent: toNumber(offerIndex.offer?.globalDiscountPercent ?? offerIndex.offer?.discountPercent, 0),
    useGlobalDiscount: Boolean(offerIndex.offer?.useGlobalDiscount ?? true),
    usePerItemDiscount: Boolean(offerIndex.offer?.usePerItemDiscount ?? false),
    vatMode: offerIndex.offer ? toNumber(offerIndex.offer.vatMode, 22) : null,
  };
}

async function resolveServicePerformedAt(projectId: string) {
  const completedOrder = await WorkOrderModel.findOne({ projectId, status: 'completed', cancelledAt: null })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .select('completedAt updatedAt createdAt')
    .lean();
  const date = completedOrder?.completedAt ?? completedOrder?.updatedAt ?? completedOrder?.createdAt ?? null;
  return date ? new Date(date).toISOString() : null;
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

export async function getNextInvoiceNumber(projectId: string) {
  await findProjectOrFail(projectId);
  return previewInvoiceSequentialNumber(new Date());
}

export async function createInvoiceFromClosing(projectId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const existingDraft = findDraftVersion(project);
  if (existingDraft) {
    return buildInvoiceResponse(project, { activeVersionId: existingDraft._id, updatedVersionId: existingDraft._id });
  }
  const source = await aggregateClosingItems(project);
  const { items, summary } = recalculateItems(source.items, {
    discountPercent: source.discountPercent,
    useGlobalDiscount: source.useGlobalDiscount,
    usePerItemDiscount: source.usePerItemDiscount,
    vatMode: source.vatMode,
  });
  const servicePerformedAt = await resolveServicePerformedAt(project.id);
  const version: InvoiceVersion = {
    _id: new Types.ObjectId().toString(),
    versionNumber: resolveNextVersionNumber(project),
    status: 'draft',
    createdAt: new Date().toISOString(),
    issuedAt: null,
    servicePerformedAt,
    discountPercent: source.discountPercent,
    useGlobalDiscount: source.useGlobalDiscount,
    usePerItemDiscount: source.usePerItemDiscount,
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
  const existingItemsById = new Map((version.items ?? []).map((item) => [item.id, item]));
  const mergedInputItems = inputItems.map((item) => {
    const existing = item.id ? existingItemsById.get(item.id) : undefined;
    return {
      ...item,
      discountPercent:
        item.discountPercent !== undefined ? item.discountPercent : existing?.discountPercent ?? 0,
    };
  });
  const { items, summary } = recalculateItems(mergedInputItems, {
    discountPercent: toNumber(version.discountPercent, 0),
    useGlobalDiscount: Boolean(version.useGlobalDiscount),
    usePerItemDiscount: Boolean(version.usePerItemDiscount),
  });
  version.items = items;
  version.summary = summary;
  markInvoiceVersionsModified(project);
  await project.save();
  return serializeResponse(project);
}

export async function issueInvoiceVersion(projectId: string, versionId: string, payload?: { invoiceNumber?: unknown }): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const version = ensureInvoiceVersion(project, versionId);
  const previousStatus = version.status;
  const previousIssuedAt = version.issuedAt;
  const previousInvoiceNumber = version.invoiceNumber;
  const previousInvoiceSequence = version.invoiceSequence;
  if (version.status === 'issued') {
    console.log('[invoice] issue skipped', {
      projectId,
      invoiceVersionId: versionId,
      previousStatus,
      nextStatus: version.status,
      reason: 'already-issued',
    });
    return buildInvoiceResponse(project, { activeVersionId: version._id, updatedVersionId: version._id, includeProjectStatus: true });
  }
  const cancelledIssuedVersionIds: string[] = [];
  (project.invoiceVersions ?? []).forEach((entry) => {
    if (entry._id !== version._id && entry.status === 'issued') {
      entry.status = 'cancelled';
      cancelledIssuedVersionIds.push(String(entry._id));
    }
  });
  const issuedAt = new Date();
  const numbering = await resolveInvoiceNumberForIssue(
    version,
    issuedAt,
    payload?.invoiceNumber,
    getInvoiceCorrectionChainIds(project.invoiceVersions ?? [], version),
  );
  version.status = 'issued';
  version.issuedAt = issuedAt.toISOString();
  version.invoiceNumber = numbering.invoiceNumber;
  version.invoiceSequence = numbering.invoiceSequence;
  version.servicePerformedAt = version.servicePerformedAt ?? (await resolveServicePerformedAt(project.id));
  const fallbackCorrectedFromInvoiceVersionId =
    version.correctedFromInvoiceVersionId ??
    cancelledIssuedVersionIds[0] ??
    (project.invoiceVersions ?? [])
      .filter((entry) => entry._id !== version._id && entry.status === 'cancelled')
      .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))[0]?._id ??
    null;
  markInvoiceVersionsModified(project);
  try {
    await createFinanceSnapshot({
      project: {
        id: project.id,
        customer: project.customer,
        confirmedOfferVersionId: project.confirmedOfferVersionId ?? null,
        salesUserId: project.salesUserId ? String(project.salesUserId) : null,
      },
      invoiceVersion: {
        _id: version._id,
        versionNumber: version.versionNumber,
        invoiceNumber: version.invoiceNumber,
        issuedAt: version.issuedAt,
        items: version.items.map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatPercent: item.vatPercent,
          totalWithoutVat: item.totalWithoutVat,
          type: item.type,
        })),
        summary: version.summary,
      },
      correctedFromInvoiceVersionId: fallbackCorrectedFromInvoiceVersionId,
    });
  } catch (error) {
    version.status = previousStatus;
    version.issuedAt = previousIssuedAt ?? null;
    version.invoiceNumber = previousInvoiceNumber ?? null;
    version.invoiceSequence = previousInvoiceSequence ?? null;
    cancelledIssuedVersionIds.forEach((cancelledId) => {
      const entry = (project.invoiceVersions ?? []).find((candidate) => String(candidate._id) === cancelledId);
      if (entry) {
        entry.status = 'issued';
      }
    });
    markInvoiceVersionsModified(project);
    console.error('[invoice] finance-snapshot failed; invoice issue aborted', {
      projectId,
      invoiceVersionId: versionId,
      error,
    });
    throw new Error('Računa ni mogoče izdati, ker finančnega snapshota ni bilo mogoče ustvariti.');
  }

  if (project.status !== 'invoiced') {
    project.status = 'invoiced';
    addTimeline(project, {
      type: 'status-change',
      title: 'Status spremenjen',
      description: "Projekt prešel v fazo 'Računano' po izdaji računa",
      timestamp: new Date().toISOString(),
      user: 'system',
    });
  }

  await project.save();
  console.log('[invoice] issue success', {
    projectId,
    invoiceVersionId: versionId,
    previousStatus,
    nextStatus: version.status,
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
    invoiceNumber: version.invoiceNumber ?? null,
    invoiceSequence: version.invoiceSequence ?? null,
    status: 'draft',
    createdAt: new Date().toISOString(),
    issuedAt: null,
    servicePerformedAt: version.servicePerformedAt ?? (await resolveServicePerformedAt(project.id)),
    correctedFromInvoiceVersionId: version._id,
    discountPercent: version.discountPercent ?? 0,
    useGlobalDiscount: version.useGlobalDiscount ?? false,
    usePerItemDiscount: version.usePerItemDiscount ?? false,
    items: clonedItems,
    summary: { ...version.summary },
  };
  project.invoiceVersions = [...(project.invoiceVersions ?? []), clone];
  markInvoiceVersionsModified(project);
  await project.save();
  return buildInvoiceResponse(project, { activeVersionId: clone._id, updatedVersionId: clone._id });
}
interface RecalculateOptions {
  discountPercent?: number;
  useGlobalDiscount?: boolean;
  usePerItemDiscount?: boolean;
  vatMode?: number | null;
}

function recalculateItems(items: InvoiceItemPayload[], options: RecalculateOptions = {}) {
  const globalDiscountPercent = options.useGlobalDiscount
    ? Math.min(100, Math.max(0, toNumber(options.discountPercent, 0)))
    : 0;

  const preparedItems = items.map((item) => {
    const quantity = toNumber(item.quantity, 0);
    const unitPrice = toNumber(item.unitPrice, 0);
    const vatPercent = toNumber(item.vatPercent, 0);
    const discountPercent = options.usePerItemDiscount
      ? Math.min(100, Math.max(0, toNumber(item.discountPercent, 0)))
      : 0;
    const baseWithoutVat = round(quantity * unitPrice);
    const lineAfterPerItemDiscount = round(baseWithoutVat * (1 - discountPercent / 100));

    return {
      id: item.id ?? new Types.ObjectId().toString(),
      name: sanitizeText(item.name, 'Neimenovana postavka'),
      unit: sanitizeText(item.unit, ''),
      quantity,
      unitPrice,
      discountPercent,
      vatPercent,
      type: (item.type === 'Dodatno' || item.type === 'Manj' ? item.type : 'Osnovno') as InvoiceItemType,
      baseWithoutVat,
      lineAfterPerItemDiscount,
    };
  });

  const baseWithoutVat = round(preparedItems.reduce((sum, current) => sum + current.baseWithoutVat, 0));
  const perItemDiscountedBase = round(
    preparedItems.reduce((sum, current) => sum + current.lineAfterPerItemDiscount, 0),
  );
  const globalDiscountAmount = round(perItemDiscountedBase * (globalDiscountPercent / 100));
  const globalDiscountCandidates = preparedItems.filter((item) => item.lineAfterPerItemDiscount > 0);
  let allocatedGlobalDiscount = 0;

  let updatedItems: InvoiceItem[] = preparedItems.map((item) => {
    let itemGlobalDiscount = 0;
    const isLastCandidate =
      globalDiscountCandidates.length > 0 &&
      item.id === globalDiscountCandidates[globalDiscountCandidates.length - 1].id;

    if (globalDiscountPercent > 0 && item.lineAfterPerItemDiscount > 0) {
      if (isLastCandidate) {
        itemGlobalDiscount = round(globalDiscountAmount - allocatedGlobalDiscount);
      } else if (perItemDiscountedBase > 0) {
        itemGlobalDiscount = round(
          globalDiscountAmount * (item.lineAfterPerItemDiscount / perItemDiscountedBase),
        );
        allocatedGlobalDiscount = round(allocatedGlobalDiscount + itemGlobalDiscount);
      }
    }

    const totalWithoutVat = round(Math.max(0, item.lineAfterPerItemDiscount - itemGlobalDiscount));
    const vatAmount = round(totalWithoutVat * (item.vatPercent / 100));
    const totalWithVat = round(totalWithoutVat + vatAmount);

    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      vatPercent: item.vatPercent,
      totalWithoutVat,
      totalWithVat,
      type: item.type as InvoiceItemType,
    };
  });

  const discountedBase = round(updatedItems.reduce((sum, current) => sum + current.totalWithoutVat, 0));
  const vatMode = typeof options.vatMode === 'number' && Number.isFinite(options.vatMode) ? options.vatMode : null;
  if (vatMode !== null) {
    const targetVatAmount = round(discountedBase * (vatMode / 100));
    const vatCandidates = updatedItems.filter((item) => item.totalWithoutVat > 0);
    let allocatedVat = 0;
    updatedItems = updatedItems.map((item) => {
      if (vatCandidates.length === 0 || item.totalWithoutVat <= 0) {
        return {
          ...item,
          vatPercent: vatMode,
          totalWithVat: item.totalWithoutVat,
        };
      }
      const isLastCandidate = item.id === vatCandidates[vatCandidates.length - 1].id;
      const itemVat = isLastCandidate
        ? round(targetVatAmount - allocatedVat)
        : round(targetVatAmount * (item.totalWithoutVat / discountedBase));
      if (!isLastCandidate) {
        allocatedVat = round(allocatedVat + itemVat);
      }
      return {
        ...item,
        vatPercent: vatMode,
        totalWithVat: round(item.totalWithoutVat + itemVat),
      };
    });
  }
  const vatAmount = vatMode !== null
    ? round(discountedBase * (vatMode / 100))
    : round(updatedItems.reduce((sum, current) => sum + (current.totalWithVat - current.totalWithoutVat), 0));
  const totalWithVat = vatMode !== null
    ? round(discountedBase + vatAmount)
    : round(updatedItems.reduce((sum, current) => sum + current.totalWithVat, 0));

  return {
    items: updatedItems,
    summary: {
      baseWithoutVat,
      discountedBase,
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

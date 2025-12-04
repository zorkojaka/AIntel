import { Types } from 'mongoose';
import { ProjectModel, type Project, type ProjectDocument } from '../schemas/project';
import { WorkOrderModel } from '../schemas/work-order';

type InvoiceStatus = 'draft' | 'issued';
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
  const plain = 'toObject' in project ? project.toObject<Project>() : (project as Project);
  const versions = [...(plain.invoiceVersions ?? [])].sort((a, b) => a.versionNumber - b.versionNumber);
  return {
    versions,
    activeVersionId: selectActiveVersionId(versions),
  };
}

async function aggregateClosingItems(projectId: string): Promise<InvoiceItemPayload[]> {
  const workOrders = await WorkOrderModel.find({ projectId }).lean();
  const grouped = new Map<
    string,
    {
      name: string;
      unit: string;
      offered: number;
      executed: number;
      isExtra: boolean;
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
      const current = grouped.get(groupKey) ?? { name: sanitizeText(item.name, ''), unit: sanitizeText(item.unit, ''), offered: 0, executed: 0, isExtra: false };
      grouped.set(groupKey, {
        name: sanitizeText(current.name || item.name, 'Neimenovana postavka'),
        unit: sanitizeText(current.unit || item.unit, ''),
        offered: current.offered + offered,
        executed: current.executed + executed,
        isExtra: current.isExtra || !!item.isExtra || offered === 0,
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
    invoiceItems.push({
      name: entry.name || 'Neimenovana postavka',
      unit: entry.unit || '',
      quantity: entry.executed,
      unitPrice: 0,
      vatPercent: 22,
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
  const sourceItems = await aggregateClosingItems(projectId);
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
  await project.save();
  return serializeResponse(project);
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
  await project.save();
  return serializeResponse(project);
}

export async function issueInvoiceVersion(projectId: string, versionId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const version = ensureInvoiceVersion(project, versionId);
  if (version.status === 'issued') {
    throw new Error('Verzija je že izdana.');
  }
  version.status = 'issued';
  version.issuedAt = new Date().toISOString();
  await project.save();
  return serializeResponse(project);
}

export async function cloneInvoiceVersion(projectId: string, versionId: string): Promise<InvoiceListResponse> {
  const project = await findProjectOrFail(projectId);
  const version = ensureInvoiceVersion(project, versionId);
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
  await project.save();
  return serializeResponse(project);
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

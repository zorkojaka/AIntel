import { Types } from 'mongoose';
import type {
  WorkOrderConfirmationState,
  WorkOrderConfirmationVersion,
  WorkOrderConfirmationVersionState,
} from '../schemas/work-order';

type WorkOrderLike = {
  _id?: unknown;
  projectId: string;
  offerVersionId: string;
  code?: string | null;
  title?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerSignerName?: string | null;
  customerSignature?: string | null;
  customerSignedAt?: Date | string | null;
  customerRemark?: string | null;
  scheduledAt?: string | null;
  mainInstallerId?: unknown;
  assignedEmployeeIds?: unknown[];
  location?: string | null;
  notes?: string | null;
  executionNote?: string | null;
  items?: unknown[];
  createdAt?: Date | string | null;
  confirmationState?: WorkOrderConfirmationState;
  confirmationActiveVersionId?: string | null;
  confirmationVersions?: WorkOrderConfirmationVersion[];
};

function asString(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function mapExecutionSpec(input: any) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  return {
    mode:
      input.mode === 'simple' || input.mode === 'per_unit' || input.mode === 'measured'
        ? input.mode
        : 'simple',
    locationSummary:
      typeof input.locationSummary === 'string'
        ? input.locationSummary
        : input.locationSummary === null
          ? null
          : null,
    instructions:
      typeof input.instructions === 'string'
        ? input.instructions
        : input.instructions === null
          ? null
          : null,
    trackingUnitLabel:
      typeof input.trackingUnitLabel === 'string'
        ? input.trackingUnitLabel
        : input.trackingUnitLabel === null
          ? null
          : null,
    executionUnits: Array.isArray(input.executionUnits)
      ? input.executionUnits.map((unit: any) => ({
          id: asString(unit?.id),
          label: typeof unit?.label === 'string' ? unit.label : '',
          location:
            typeof unit?.location === 'string' ? unit.location : unit?.location === null ? null : null,
          instructions:
            typeof unit?.instructions === 'string'
              ? unit.instructions
              : unit?.instructions === null
                ? null
                : null,
          isCompleted: !!unit?.isCompleted,
          note: typeof unit?.note === 'string' ? unit.note : unit?.note === null ? null : null,
        }))
      : [],
  };
}

function mapItems(items: unknown[] | undefined) {
  return Array.isArray(items)
    ? items.map((item: any) => ({
        id: asString(item?.id),
        productId: typeof item?.productId === 'string' ? item.productId : null,
        name: typeof item?.name === 'string' ? item.name : '',
        quantity: typeof item?.quantity === 'number' ? item.quantity : 0,
        unit: typeof item?.unit === 'string' ? item.unit : '',
        isService: !!item?.isService,
        note: typeof item?.note === 'string' ? item.note : '',
        offerItemId: typeof item?.offerItemId === 'string' ? item.offerItemId : null,
        offeredQuantity: typeof item?.offeredQuantity === 'number' ? item.offeredQuantity : 0,
        plannedQuantity: typeof item?.plannedQuantity === 'number' ? item.plannedQuantity : 0,
        executedQuantity: typeof item?.executedQuantity === 'number' ? item.executedQuantity : 0,
        isExtra: !!item?.isExtra,
        itemNote: typeof item?.itemNote === 'string' ? item.itemNote : item?.itemNote === null ? null : null,
        isCompleted: !!item?.isCompleted,
        casovnaNorma: typeof item?.casovnaNorma === 'number' ? item.casovnaNorma : 0,
        executionSpec: mapExecutionSpec(item?.executionSpec),
      }))
    : [];
}

function toPlainVersion(version: WorkOrderConfirmationVersion | undefined | null) {
  if (!version) {
    return null;
  }
  const raw = typeof (version as any)?.toObject === 'function' ? (version as any).toObject() : version;
  return {
    ...raw,
    id: asString((raw as any)?.id ?? (raw as any)?._id),
    workOrderId: asString((raw as any)?.workOrderId),
    projectId: asString((raw as any)?.projectId),
    offerVersionId: asString((raw as any)?.offerVersionId),
    versionNumber: Number((raw as any)?.versionNumber ?? 0) || 0,
    state: (raw as any)?.state,
    signerName: typeof (raw as any)?.signerName === 'string' ? (raw as any).signerName : '',
    customerRemark:
      typeof (raw as any)?.customerRemark === 'string'
        ? (raw as any).customerRemark
        : (raw as any)?.customerRemark === null
          ? null
          : null,
    signature: typeof (raw as any)?.signature === 'string' ? (raw as any).signature : '',
    signedAt: (raw as any)?.signedAt ? new Date((raw as any).signedAt) : null,
    assignedEmployeeIds: Array.isArray((raw as any)?.assignedEmployeeIds)
      ? (raw as any).assignedEmployeeIds.map((entry: unknown) => asString(entry)).filter(Boolean)
      : [],
    items: mapItems((raw as any)?.items as unknown[]),
    executionNote:
      typeof (raw as any)?.executionNote === 'string'
        ? (raw as any).executionNote
        : (raw as any)?.executionNote === null
          ? null
          : null,
    notes:
      typeof (raw as any)?.notes === 'string' ? (raw as any).notes : (raw as any)?.notes === null ? null : null,
    customerName:
      typeof (raw as any)?.customerName === 'string'
        ? (raw as any).customerName
        : (raw as any)?.customerName === null
          ? null
          : null,
    customerEmail:
      typeof (raw as any)?.customerEmail === 'string'
        ? (raw as any).customerEmail
        : (raw as any)?.customerEmail === null
          ? null
          : null,
    customerPhone:
      typeof (raw as any)?.customerPhone === 'string'
        ? (raw as any).customerPhone
        : (raw as any)?.customerPhone === null
          ? null
          : null,
    customerAddress:
      typeof (raw as any)?.customerAddress === 'string'
        ? (raw as any).customerAddress
        : (raw as any)?.customerAddress === null
          ? null
          : null,
    scheduledAt:
      typeof (raw as any)?.scheduledAt === 'string'
        ? (raw as any).scheduledAt
        : (raw as any)?.scheduledAt === null
          ? null
          : null,
    mainInstallerId: (raw as any)?.mainInstallerId ? asString((raw as any).mainInstallerId) : null,
    location:
      typeof (raw as any)?.location === 'string' ? (raw as any).location : (raw as any)?.location === null ? null : null,
    workOrderCode:
      typeof (raw as any)?.workOrderCode === 'string'
        ? (raw as any).workOrderCode
        : (raw as any)?.workOrderCode === null
          ? null
          : null,
    workOrderTitle:
      typeof (raw as any)?.workOrderTitle === 'string'
        ? (raw as any).workOrderTitle
        : (raw as any)?.workOrderTitle === null
          ? null
          : null,
    workOrderCreatedAt: (raw as any)?.workOrderCreatedAt ? new Date((raw as any).workOrderCreatedAt) : null,
    createdAt: (raw as any)?.createdAt ? new Date((raw as any).createdAt) : null,
  } as WorkOrderConfirmationVersion;
}

function normalizeVersions(
  versions: WorkOrderConfirmationVersion[] | undefined,
  activeVersionId: string | null | undefined,
): WorkOrderConfirmationVersion[] {
  const list = Array.isArray(versions) ? versions.map((version) => toPlainVersion(version)).filter(Boolean) : [];
  return list
    .map((version) => ({
      ...version,
      state:
        version.id === activeVersionId
          ? 'active'
          : version.state === 'active'
            ? 'archived'
            : (version.state ?? 'archived'),
      assignedEmployeeIds: Array.isArray(version.assignedEmployeeIds)
        ? version.assignedEmployeeIds.map((entry) => asString(entry)).filter(Boolean)
        : [],
      items: mapItems(version.items as unknown[]),
    }) as WorkOrderConfirmationVersion)
    .sort((a, b) => (a.versionNumber ?? 0) - (b.versionNumber ?? 0));
}

export function buildConfirmationVersionSnapshot(
  order: WorkOrderLike,
  input?: {
    signerName?: string;
    signature?: string;
    signedAt?: Date;
    customerRemark?: string | null;
    state?: WorkOrderConfirmationVersionState;
    versionNumber?: number;
  },
): WorkOrderConfirmationVersion {
  return {
    id: new Types.ObjectId().toString(),
    workOrderId: asString(order._id),
    projectId: order.projectId,
    offerVersionId: order.offerVersionId,
    versionNumber: input?.versionNumber ?? 1,
    state: input?.state ?? 'active',
    signerName: input?.signerName ?? order.customerSignerName ?? order.customerName ?? '',
    customerRemark: input?.customerRemark ?? order.customerRemark ?? null,
    signature: input?.signature ?? order.customerSignature ?? '',
    signedAt: input?.signedAt ?? (order.customerSignedAt ? new Date(order.customerSignedAt) : null),
    items: mapItems(order.items),
    executionNote: order.executionNote ?? null,
    notes: order.notes ?? null,
    customerName: order.customerName ?? null,
    customerEmail: order.customerEmail ?? null,
    customerPhone: order.customerPhone ?? null,
    customerAddress: order.customerAddress ?? null,
    scheduledAt: order.scheduledAt ?? null,
    mainInstallerId: order.mainInstallerId ? asString(order.mainInstallerId) : null,
    assignedEmployeeIds: Array.isArray(order.assignedEmployeeIds)
      ? order.assignedEmployeeIds.map((entry) => asString(entry)).filter(Boolean)
      : [],
    location: order.location ?? null,
    workOrderCode: order.code ?? null,
    workOrderTitle: order.title ?? null,
    workOrderCreatedAt: order.createdAt ? new Date(order.createdAt) : null,
    createdAt: new Date(),
  };
}

export function getConfirmationVersions(order: WorkOrderLike): WorkOrderConfirmationVersion[] {
  const activeVersionId = order.confirmationActiveVersionId ?? null;
  const normalized = normalizeVersions(order.confirmationVersions, activeVersionId);
  if (normalized.length > 0) {
    return normalized;
  }
  if (order.customerSignature && order.customerSignedAt) {
    return [
      buildConfirmationVersionSnapshot(order, {
        state: order.confirmationState === 'resign_required' ? 'archived' : 'active',
      }),
    ];
  }
  return [];
}

export function getActiveConfirmationVersion(order: WorkOrderLike): WorkOrderConfirmationVersion | null {
  const versions = getConfirmationVersions(order);
  const activeVersionId = order.confirmationActiveVersionId ?? null;
  if (activeVersionId) {
    return versions.find((version) => version.id === activeVersionId) ?? null;
  }
  return versions.find((version) => version.state === 'active') ?? null;
}

export function getActiveSignedConfirmationVersion(order: WorkOrderLike): WorkOrderConfirmationVersion | null {
  if (order.confirmationState !== 'signed_active') {
    return null;
  }

  const activeVersionId =
    typeof order.confirmationActiveVersionId === 'string' && order.confirmationActiveVersionId.trim().length > 0
      ? order.confirmationActiveVersionId.trim()
      : null;
  if (!activeVersionId) {
    return null;
  }

  const activeVersion = getConfirmationVersions(order).find((version) => version.id === activeVersionId) ?? null;
  if (!activeVersion || activeVersion.state !== 'active' || !activeVersion.signedAt) {
    return null;
  }

  return activeVersion;
}

export function getHistoricalConfirmationVersions(order: WorkOrderLike): WorkOrderConfirmationVersion[] {
  const activeVersionId = getActiveSignedConfirmationVersion(order)?.id ?? null;
  return getConfirmationVersions(order).filter((version) => version.id !== activeVersionId);
}

export function getConfirmationVersionById(order: WorkOrderLike, versionId: string | null | undefined) {
  if (!versionId) return null;
  return getConfirmationVersions(order).find((version) => version.id === versionId) ?? null;
}

export function resolveConfirmationState(order: WorkOrderLike): WorkOrderConfirmationState {
  if (order.confirmationState === 'resign_required') {
    return 'resign_required';
  }
  return getActiveSignedConfirmationVersion(order) ? 'signed_active' : 'unsigned';
}

export function isConfirmationLocked(order: WorkOrderLike) {
  return resolveConfirmationState(order) === 'signed_active';
}

export function ensureConfirmationVersionHistory(order: WorkOrderLike & { markModified?: (path: string) => void }) {
  const normalizedVersions = normalizeVersions(order.confirmationVersions, order.confirmationActiveVersionId ?? null);
  if (normalizedVersions.length > 0) {
    order.confirmationVersions = normalizedVersions;
    order.confirmationState = resolveConfirmationState(order);
    return { migratedLegacySignature: false };
  }
  if (!order.customerSignature || !order.customerSignedAt) {
    order.confirmationVersions = [];
    order.confirmationActiveVersionId = null;
    order.confirmationState = order.confirmationState === 'resign_required' ? 'resign_required' : 'unsigned';
    return { migratedLegacySignature: false };
  }

  const version = buildConfirmationVersionSnapshot(order, {
    versionNumber: 1,
    state: order.confirmationState === 'resign_required' ? 'archived' : 'active',
  });
  order.confirmationVersions = [version];
  order.confirmationActiveVersionId = version.state === 'active' ? version.id : null;
  order.confirmationState = version.state === 'active' ? 'signed_active' : 'resign_required';
  order.markModified?.('confirmationVersions');
  return { migratedLegacySignature: true };
}

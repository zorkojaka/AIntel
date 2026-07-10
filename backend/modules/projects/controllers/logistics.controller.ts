import { NextFunction, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import type {
  MaterialOrder,
  MaterialPickupMethod,
  ProjectExecutionDefinitionItem,
  ProjectLogisticsSnapshot,
  WorkOrder,
} from '../../../../shared/types/logistics';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel, addTimeline } from '../schemas/project';
import { MaterialOrderModel } from '../schemas/material-order';
import { WorkOrderModel } from '../schemas/work-order';
import { ProductModel } from '../../cenik/product.model';
import { ZahtevaModel } from '../../zahteve/zahteva.model';
import { resolveActorId, resolveTenantId } from '../../../utils/tenant';
import { EmployeeModel } from '../../employees/schemas/employee';
import { ROLE_EXECUTION } from '../../../utils/roles';
import type { OfferLineItem } from '../../../../shared/types/offers';
import { formatClientAddress, resolveProjectClient, serializeProjectDetails } from '../services/project.service';
import {
  generateMaterialOrderDocumentPdf,
  generateWorkOrderDocumentPdf,
} from '../services/project-document-pdf.service';
import {
  ensureConfirmationVersionHistory,
  getActiveSignedConfirmationVersion,
  getConfirmationVersions,
  isConfirmationLocked,
  resolveConfirmationState,
} from '../services/work-order-confirmation.service';
import { canEditPreparation } from '../../../../shared/utils/preparationAccess';
import { getSettings } from '../../settings/settings.service';
import { createInvoiceFromClosing } from '../services/invoice.service';
import {
  buildActorDisplayName,
  recordOfferConfirmedCommunicationEvent,
} from '../../communication/services/communication.service';
import { normalizeSupplierFields, normalizeSupplierKey } from '../services/supplier-normalization.service';

function calculateOfferTotalsFromSnapshot(offer: {
  items: OfferLineItem[];
  usePerItemDiscount?: boolean;
  useGlobalDiscount?: boolean;
  globalDiscountPercent?: number;
  discountPercent?: number;
  vatMode?: number;
}) {
  const items = offer.items || [];
  const usePerItemDiscount = offer.usePerItemDiscount ?? false;
  const useGlobalDiscount = offer.useGlobalDiscount ?? true;
  const globalDiscountPercent = offer.globalDiscountPercent ?? offer.discountPercent ?? 0;
  const vatMode = offer.vatMode ?? 22;

  const round2 = (value: number) => Number(value.toFixed(2));

  const baseWithoutVat = items.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 0), 0);

  const perItemDiscountAmount = usePerItemDiscount
    ? items.reduce((sum, item) => {
        const pct = typeof item.discountPercent === 'number' ? Math.max(0, item.discountPercent) : 0;
        const lineNet = (item.unitPrice || 0) * (item.quantity || 0);
        return sum + (lineNet * pct) / 100;
      }, 0)
    : 0;

  const baseAfterPerItem = baseWithoutVat - perItemDiscountAmount;

  const normalizedGlobalPct = useGlobalDiscount ? Math.min(100, Math.max(0, Number(globalDiscountPercent) || 0)) : 0;
  const globalDiscountAmount = normalizedGlobalPct > 0 ? (baseAfterPerItem * normalizedGlobalPct) / 100 : 0;

  const baseAfterDiscount = baseAfterPerItem - globalDiscountAmount;

  const vatMultiplier = vatMode === 22 ? 0.22 : vatMode === 9.5 ? 0.095 : 0;
  const vatAmount = baseAfterDiscount * vatMultiplier;
  const totalWithVat = baseAfterDiscount + vatAmount;

  return {
    baseWithoutVat: round2(baseWithoutVat),
    perItemDiscountAmount: round2(perItemDiscountAmount),
    globalDiscountAmount: round2(globalDiscountAmount),
    baseAfterDiscount: round2(baseAfterDiscount),
    vatAmount: round2(vatAmount),
    totalWithVat: round2(totalWithVat),
  };
}

const MATERIAL_STATUS_VALUES = ['Za naročit', 'Naročeno', 'Prevzeto', 'Pripravljeno', 'Dostavljeno', 'Zmontirano'];
const MATERIAL_STEP_SEQUENCE = ['Za naročiti', 'Naročeno', 'Za prevzem', 'Prevzeto', 'Pripravljeno'] as const;
type MaterialStep = (typeof MATERIAL_STEP_SEQUENCE)[number];
const MATERIAL_STATUS_BY_STEP: Record<MaterialStep, string> = {
  'Za naročiti': 'Za naročit',
  'Naročeno': 'Naročeno',
  'Za prevzem': 'Naročeno',
  'Prevzeto': 'Prevzeto',
  'Pripravljeno': 'Pripravljeno',
};

const MATERIAL_PICKUP_METHOD_VALUES: MaterialPickupMethod[] = [
  'COMPANY_PICKUP',
  'SUPPLIER_PICKUP',
  'DIRECT_TO_INSTALLER',
  'DIRECT_TO_SITE',
];

function getContextRoles(req: Request): string[] {
  const roles = (req as any)?.context?.roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
}

function hasPreparationPayload(payload: Record<string, unknown>) {
  return (
    'scheduledAt' in payload ||
    'scheduledConfirmedAt' in payload ||
    'scheduleConfirmedAt' in payload ||
    'assignedEmployeeIds' in payload ||
    'mainInstallerId' in payload ||
    'location' in payload ||
    'notes' in payload ||
    'materialOrderId' in payload ||
    'materialStatus' in payload ||
    'materialAssignedEmployeeIds' in payload ||
    'pickupMethod' in payload ||
    'pickupLocation' in payload ||
    'logisticsOwnerId' in payload ||
    'pickupNote' in payload ||
    'expectedAt' in payload ||
    'pickupConfirmedAt' in payload ||
    'materialItems' in payload ||
    payload.status === 'issued'
  );
}

function isExecutionRoleWithoutPreparationAccess(roles: string[]) {
  return roles.includes(ROLE_EXECUTION) && !canEditPreparation(roles);
}

function hasPreparationOnlyWorkOrderPayload(payload: Record<string, unknown>) {
  return (
    'scheduledAt' in payload ||
    'scheduledConfirmedAt' in payload ||
    'scheduleConfirmedAt' in payload ||
    'assignedEmployeeIds' in payload ||
    'mainInstallerId' in payload ||
    'location' in payload ||
    'notes' in payload ||
    payload.status === 'issued'
  );
}

function hasPreparationOnlyMaterialPayload(payload: Record<string, unknown>) {
  return (
    'materialAssignedEmployeeIds' in payload ||
    'pickupMethod' in payload ||
    'pickupLocation' in payload ||
    'logisticsOwnerId' in payload ||
    'pickupNote' in payload ||
    'expectedAt' in payload
  );
}

function isExecutionMaterialStatus(value: unknown) {
  return value === 'Prevzeto' || value === 'Dostavljeno' || value === 'Zmontirano';
}

function isExecutionMaterialStep(value: unknown) {
  return value === 'Za prevzem' || value === 'Prevzeto';
}

function resolveMaterialStep(value: unknown): MaterialStep {
  return MATERIAL_STEP_SEQUENCE.includes(value as MaterialStep) ? (value as MaterialStep) : 'Za naročiti';
}

function parseOptionalDate(value: unknown) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getNextStep(step: MaterialStep | null): MaterialStep | null {
  if (!step) return MATERIAL_STEP_SEQUENCE[0];
  const index = MATERIAL_STEP_SEQUENCE.indexOf(step);
  if (index < 0 || index >= MATERIAL_STEP_SEQUENCE.length - 1) return null;
  return MATERIAL_STEP_SEQUENCE[index + 1];
}

function isStepEligible(item: any, targetStep: MaterialStep) {
  if (targetStep === 'Naročeno') return true;
  if (targetStep === 'Za prevzem') return true;
  if (targetStep === 'Prevzeto') {
    const requiredQty = typeof item.quantity === 'number' ? item.quantity : 0;
    const deliveredQty = typeof item.deliveredQty === 'number' ? item.deliveredQty : 0;
    return deliveredQty >= requiredQty;
  }
  if (targetStep === 'Pripravljeno') return true;
  return false;
}

function resolveSupplierKey(item: any) {
  if (typeof item.supplierKey === 'string' && item.supplierKey.trim().length > 0) return item.supplierKey;
  return normalizeSupplierKey(item.dobavitelj, item.naslovDobavitelja);
}

function mapOfferItemsToLogistics(items: OfferLineItem[]) {
  return items.map((item) => {
    const note = (item as any).note;
    return normalizeSupplierFields({
      id: item.id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      isOrdered: false,
      orderedQty: 0,
      deliveredQty: 0,
      unit: item.unit,
      note,
      dobavitelj: (item as any).dobavitelj,
      naslovDobavitelja: (item as any).naslovDobavitelja,
      materialStep: 'Za naročiti',
    });
  });
}

type LogisticsItems = ReturnType<typeof mapOfferItemsToLogistics>;

function normalizeExecutionMode(value: unknown): 'simple' | 'per_unit' | 'measured' {
  return value === 'per_unit' || value === 'measured' ? value : 'simple';
}

function isMeasurementLikeUnit(unit?: string | null) {
  const normalized = (unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\[\]\*]/g, '')
    .replace(/\s+/g, '')
    .replace('²', '2')
    .replace('³', '3');
  return [
    'km',
    'kilometer',
    'kilometri',
    'kilometrov',
    'h',
    'ura',
    'ure',
    'ur',
    'min',
    'm',
    'meter',
    'metri',
    'metrov',
    'm2',
    'm3',
    'kg',
    'g',
    'l',
  ].includes(normalized);
}

function hasMeasurementLikeName(name?: string | null) {
  const match = (name ?? '').toLowerCase().match(/\[([^\]]+)\]\s*\*?/);
  if (!match) return false;
  const normalized = match[1].replace(',', '.').trim();
  return isMeasurementLikeUnit(normalized) || isMeasurementLikeUnit(normalized.replace(/^\d+(?:\.\d+)?/, ''));
}

function sanitizeExecutionSpec(input: any) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  return {
    mode: normalizeExecutionMode(input.mode),
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
          id:
            typeof unit?.id === 'string' && unit.id.trim().length > 0
              ? unit.id
              : new Types.ObjectId().toString(),
          label: typeof unit?.label === 'string' ? unit.label : '',
          projectLocationId:
            typeof unit?.projectLocationId === 'string' && unit.projectLocationId.trim().length > 0
              ? unit.projectLocationId.trim()
              : typeof unit?.sourcePhotoItemId === 'string' && unit.sourcePhotoItemId.trim().length > 0
                ? unit.sourcePhotoItemId.trim()
                : null,
          sourcePhotoItemId:
            typeof unit?.sourcePhotoItemId === 'string' && unit.sourcePhotoItemId.trim().length > 0
              ? unit.sourcePhotoItemId.trim()
              : null,
          location: typeof unit?.location === 'string' ? unit.location : unit?.location === null ? null : null,
          instructions:
            typeof unit?.instructions === 'string'
              ? unit.instructions
              : unit?.instructions === null
                ? null
                : null,
          isCompleted: !!unit?.isCompleted,
          completedBy: normalizeExecutionUnitEmployeeId(unit?.completedBy),
          completedAt: normalizeExecutionUnitCompletedAt(unit?.completedAt),
          completedByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.completedByEmployeeId),
          executedBy: normalizeExecutionUnitEmployeeId(unit?.executedBy),
          executedByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.executedByEmployeeId),
          markedDoneBy: normalizeExecutionUnitEmployeeId(unit?.markedDoneBy),
          markedDoneByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.markedDoneByEmployeeId),
          doneBy: normalizeExecutionUnitEmployeeId(unit?.doneBy),
          doneByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.doneByEmployeeId),
          note: typeof unit?.note === 'string' ? unit.note : unit?.note === null ? null : null,
        }))
      : [],
  };
}

function normalizeExecutionUnitEmployeeId(value: unknown) {
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
      return normalizeExecutionUnitEmployeeId(nestedValue);
    }
    if (typeof (value as { toString?: unknown }).toString === 'function') {
      const stringValue = String(value);
      return stringValue && stringValue !== '[object Object]' ? stringValue : null;
    }
    return null;
  }
  return null;
}

function normalizeExecutionUnitCompletedAt(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

function normalizeCompletedAt(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function normalizeWorkOrderTimeTracking(input: unknown, actorEmployeeId?: string | null) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const events = Array.isArray((input as { events?: unknown }).events)
    ? (input as { events: unknown[] }).events
        .map((event) => {
          if (!event || typeof event !== 'object') return null;
          const eventType = (event as { type?: unknown }).type;
          if (eventType !== 'play' && eventType !== 'pause') return null;
          const timestamp = normalizeCompletedAt((event as { timestamp?: unknown }).timestamp);
          if (!timestamp) return null;
          return {
            type: eventType,
            timestamp,
            employeeId:
              normalizeExecutionUnitEmployeeId((event as { employeeId?: unknown }).employeeId) ??
              actorEmployeeId ??
              null,
          };
        })
        .filter((event): event is NonNullable<typeof event> => event !== null)
    : [];
  return { events };
}

function serializeWorkOrderTimeTracking(input: unknown) {
  const normalized = normalizeWorkOrderTimeTracking(input);
  return normalized
    ? {
        events: normalized.events.map((event) => ({
          type: event.type,
          timestamp: event.timestamp.toISOString(),
          employeeId: normalizeExecutionUnitEmployeeId(event.employeeId),
        })),
      }
    : null;
}

function resolveActorEmployeeId(req: Request) {
  return (
    normalizeExecutionUnitEmployeeId((req as any)?.context?.actorEmployeeId) ??
    normalizeExecutionUnitEmployeeId((req as any)?.authEmployee?._id) ??
    normalizeExecutionUnitEmployeeId((req as any)?.authUser?.employeeId) ??
    normalizeExecutionUnitEmployeeId((req as any)?.user?.employeeId)
  );
}

function buildDefaultExecutionSpec(product: any) {
  const mode =
    product?.defaultExecutionMode === 'simple' ||
    product?.defaultExecutionMode === 'per_unit' ||
    product?.defaultExecutionMode === 'measured'
      ? product.defaultExecutionMode
      : 'simple';
  const instructions =
    typeof product?.defaultInstructionsTemplate === 'string' ? product.defaultInstructionsTemplate : '';
  return {
    mode,
    locationSummary: '',
    instructions,
    trackingUnitLabel: null,
    executionUnits: [],
  };
}

function buildRequirementsExecutionSpec(item: OfferLineItem, fallbackProduct: any) {
  const locationUnits = Array.isArray(item.requirementsLocationUnits) ? item.requirementsLocationUnits : [];
  if (locationUnits.length === 0) {
    return buildDefaultExecutionSpec(fallbackProduct);
  }

  return {
    mode: 'per_unit' as const,
    locationSummary: locationUnits.map((unit) => unit.locationName).filter(Boolean).join(', '),
    instructions: typeof fallbackProduct?.defaultInstructionsTemplate === 'string' ? fallbackProduct.defaultInstructionsTemplate : '',
    trackingUnitLabel: 'Kamera',
    executionUnits: locationUnits.map((unit, index) => ({
      id: unit.locationId || `loc-${index + 1}`,
      projectLocationId: unit.projectLocationId || unit.sourcePhotoItemId || unit.locationId || null,
      sourcePhotoItemId: unit.sourcePhotoItemId || null,
      label: `Kamera ${index + 1}`,
      location: unit.locationName || `Lokacija ${index + 1}`,
      instructions: '',
      isCompleted: false,
      note: null,
    })),
  };
}

function buildZahtevaLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

function buildAlarmLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-alarm-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

function normalizeRequirementLocationName(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : fallback;
}

function buildRequirementLocationUnitsByProductId(zahteva: any) {
  const unitsByProductId = new Map<string, Array<{ locationId: string; locationName: string; sourcePhotoItemId: string; projectLocationId: string }>>();
  const zahtevaId = String(zahteva?._id ?? '');
  if (!zahtevaId) return unitsByProductId;

  const appendUnit = (productId: unknown, unit: { locationId: string; locationName: string; sourcePhotoItemId: string; projectLocationId: string }) => {
    const key = productId ? String(productId) : '';
    if (!key || !unit.locationId) return;
    const current = unitsByProductId.get(key) ?? [];
    current.push(unit);
    unitsByProductId.set(key, current);
  };

  for (const sistem of zahteva?.sistemi ?? []) {
    if ((sistem?.tip === 'videonadzor' || sistem?.tip === 'wifi_kamere') && sistem?.videonadzor) {
      const variants = new Map<string, any>(
        (sistem.videonadzor.asortima ?? []).map((variant: any) => [String(variant.id), variant])
      );
      for (const location of sistem.videonadzor.lokacije ?? []) {
        const variant = location?.asortimaIdAssigned ? variants.get(String(location.asortimaIdAssigned)) : null;
        const locationId = typeof location?.id === 'string' ? location.id : '';
        appendUnit(variant?.kameraProductId, {
          locationId,
          locationName: normalizeRequirementLocationName(location?.ime, locationId),
          sourcePhotoItemId: buildZahtevaLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
          projectLocationId: buildZahtevaLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
        });
      }
    }

    if (sistem?.tip === 'alarm' && sistem?.alarm) {
      const sensors = new Map<string, any>(
        (sistem.alarm.senzorji ?? []).map((sensor: any) => [String(sensor.id), sensor])
      );
      for (const location of sistem.alarm.lokacije ?? []) {
        const sensor = location?.senzorIdAssigned ? sensors.get(String(location.senzorIdAssigned)) : null;
        const locationId = typeof location?.id === 'string' ? location.id : '';
        appendUnit(sensor?.senzorProductId, {
          locationId,
          locationName: normalizeRequirementLocationName(location?.ime, locationId),
          sourcePhotoItemId: buildAlarmLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
          projectLocationId: buildAlarmLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
        });
      }
    }
  }

  return unitsByProductId;
}

async function buildRequirementLocationUnitFallbacks(project: any, offer: any) {
  const offerRequestId = offer?.requestId ? String(offer.requestId) : '';
  if (offerRequestId) {
    const offerZahteva = await ZahtevaModel.findById(offerRequestId).lean();
    const offerUnits = buildRequirementLocationUnitsByProductId(offerZahteva);
    if (offerUnits.size > 0) return offerUnits;
  }

  const requestIds = [
    project?.activeRequestId ? String(project.activeRequestId) : '',
    ...(Array.isArray(project?.requestIds) ? project.requestIds.map((id: any) => String(id)) : []),
  ].filter((value, index, list) => value && list.indexOf(value) === index);
  if (requestIds.length === 0) return new Map<string, Array<{ locationId: string; locationName: string; sourcePhotoItemId: string; projectLocationId: string }>>();

  const zahteva = await ZahtevaModel.findOne({ _id: { $in: requestIds } }).sort({ updatedAt: -1 }).lean();
  return buildRequirementLocationUnitsByProductId(zahteva);
}

function withRequirementLocationFallbacks(
  offerItems: OfferLineItem[],
  fallbacksByProductId: Map<string, Array<{ locationId: string; locationName: string; sourcePhotoItemId: string; projectLocationId: string }>>
) {
  const hasProductLocationFallback = (offerItems ?? []).some((item) => {
    const existingUnits = Array.isArray(item.requirementsLocationUnits) ? item.requirementsLocationUnits : [];
    if (existingUnits.length > 0) return true;
    if (!item.productId) return false;
    return (fallbacksByProductId.get(String(item.productId)) ?? []).length > 0;
  });
  const allFallbackUnits = Array.from(fallbacksByProductId.values()).flat();
  const allFallbackUnitsByLocation = new Map<string, { locationId: string; locationName: string; sourcePhotoItemId: string; projectLocationId: string }>();
  for (const unit of allFallbackUnits) {
    const key = unit.projectLocationId || unit.sourcePhotoItemId || unit.locationId;
    if (key && !allFallbackUnitsByLocation.has(key)) {
      allFallbackUnitsByLocation.set(key, unit);
    }
  }

  return (offerItems ?? []).map((item) => {
    const existingUnits = Array.isArray(item.requirementsLocationUnits) ? item.requirementsLocationUnits : [];
    if (existingUnits.length > 0 || !item.productId) return item;
    const fallbackUnits = fallbacksByProductId.get(String(item.productId)) ?? [];
    if (fallbackUnits.length > 0) return { ...item, requirementsLocationUnits: fallbackUnits };

    const itemName = typeof item.name === 'string' ? item.name.toLocaleLowerCase('sl-SI') : '';
    const isCameraInstallationService =
      !hasProductLocationFallback &&
      allFallbackUnitsByLocation.size > 0 &&
      itemName.includes('monta') &&
      itemName.includes('konfiguracija') &&
      itemName.includes('kamere');
    return isCameraInstallationService
      ? { ...item, requirementsLocationUnits: Array.from(allFallbackUnitsByLocation.values()) }
      : item;
  });
}

function mergeExecutionSpec(existing: any, fallbackProduct: any) {
  const normalizedExisting = sanitizeExecutionSpec(existing);
  if (normalizedExisting) {
    return normalizedExisting;
  }
  return buildDefaultExecutionSpec(fallbackProduct);
}

function mergeGeneratedWorkOrderItems(existingItems: any[], generatedItems: any[], productDefaultsById: Map<string, any>) {
  const existingByOfferItemId = new Map<string, any>();
  const existingById = new Map<string, any>();

  existingItems.forEach((item) => {
    const plain = item?.toObject ? item.toObject() : item;
    if (plain?.offerItemId) existingByOfferItemId.set(String(plain.offerItemId), plain);
    if (plain?.id) existingById.set(String(plain.id), plain);
  });

  const mergedGenerated = generatedItems.map((item) => {
    const existing =
      (item.offerItemId ? existingByOfferItemId.get(String(item.offerItemId)) : null) ??
      (item.id ? existingById.get(String(item.id)) : null) ??
      null;
    const productDefaults = item.productId ? productDefaultsById.get(String(item.productId)) : null;
    return {
      ...item,
      plannedQuantity:
        typeof existing?.plannedQuantity === 'number' ? existing.plannedQuantity : item.plannedQuantity,
      quantity: typeof existing?.plannedQuantity === 'number' ? existing.plannedQuantity : item.quantity,
      executedQuantity:
        typeof existing?.executedQuantity === 'number' ? existing.executedQuantity : item.executedQuantity,
      itemNote:
        typeof existing?.itemNote === 'string' || existing?.itemNote === null ? existing.itemNote : item.itemNote,
      isCompleted: typeof existing?.isCompleted === 'boolean' ? existing.isCompleted : item.isCompleted,
      timeTracking: normalizeWorkOrderTimeTracking(existing?.timeTracking),
      executionSpec: mergeExecutionSpec(existing?.executionSpec, productDefaults),
    };
  });

  const mergedIds = new Set(
    mergedGenerated.flatMap((item) => [item.id ? String(item.id) : '', item.offerItemId ? String(item.offerItemId) : ''])
  );
  const extraExistingItems = existingItems
    .map((item) => (item?.toObject ? item.toObject() : item))
    .filter((item) => item?.isExtra)
    .filter(
      (item) =>
        !mergedIds.has(item?.id ? String(item.id) : '') &&
        !mergedIds.has(item?.offerItemId ? String(item.offerItemId) : '')
    )
    .map((item) => ({
      ...item,
      timeTracking: normalizeWorkOrderTimeTracking(item?.timeTracking),
      executionSpec: sanitizeExecutionSpec(item?.executionSpec),
    }));

  return [...mergedGenerated, ...extraExistingItems];
}

function mapOfferItemsToWorkOrderItems(
  items: OfferLineItem[],
  serviceProductIds: Set<string>,
  productDefaultsById: Map<string, any>
) {
  return items.map((item) => {
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
    const generatedId = item.id ?? new Types.ObjectId().toString();
    const note = (item as any).note ?? undefined;
    const isService =
      Boolean((item as any).isService) ||
      (item.productId ? serviceProductIds.has(String(item.productId)) : false);
    const productDefaults = item.productId ? productDefaultsById.get(String(item.productId)) : null;
    return {
      id: generatedId,
      productId: item.productId ?? null,
      name: item.name,
      quantity,
      unit: item.unit,
      isService,
      note,
      offerItemId: item.id ?? null,
      offeredQuantity: quantity,
      plannedQuantity: quantity,
      executedQuantity: quantity,
      isExtra: false,
      itemNote: null,
      isCompleted: false,
      casovnaNorma: typeof (item as any).casovnaNorma === 'number' && Number.isFinite((item as any).casovnaNorma)
        ? (item as any).casovnaNorma
        : 0,
      timeTracking: null,
      executionSpec: buildRequirementsExecutionSpec(item, productDefaults),
    };
  });
}

function resolveExecutionDefinitionItemId(item: any) {
  const id = item?.offerItemId ?? item?.id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : new Types.ObjectId().toString();
}

function buildExecutionDefinitionItem(params: {
  item: any;
  offerVersionId?: string | null;
  fallbackSpec?: any;
}): ProjectExecutionDefinitionItem {
  const { item, offerVersionId, fallbackSpec } = params;
  const quantity = typeof item?.quantity === 'number'
    ? item.quantity
    : typeof item?.plannedQuantity === 'number'
      ? item.plannedQuantity
      : 0;
  const id = resolveExecutionDefinitionItemId(item);
  return normalizeMeasuredExecutionDefinition({
    id,
    offerVersionId: offerVersionId ?? item?.offerVersionId ?? null,
    offerItemId: typeof item?.offerItemId === 'string' ? item.offerItemId : id,
    productId: typeof item?.productId === 'string' ? item.productId : null,
    name: typeof item?.name === 'string' ? item.name : 'Postavka',
    quantity,
    unit: typeof item?.unit === 'string' ? item.unit : '',
    isService: item?.isService === true,
    executionSpec: sanitizeExecutionSpec(item?.executionSpec ?? fallbackSpec),
  });
}

function normalizeMeasuredExecutionDefinition<T extends ProjectExecutionDefinitionItem>(definition: T): T {
  if (!isMeasurementLikeUnit(definition.unit) && !hasMeasurementLikeName(definition.name)) return definition;
  const spec = sanitizeExecutionSpec(definition.executionSpec) ?? {
    mode: 'measured' as const,
    locationSummary: '',
    instructions: null,
    trackingUnitLabel: null,
    executionUnits: [],
  };
  const nextSpec = {
    ...spec,
    mode: 'measured' as const,
    locationSummary: '',
    trackingUnitLabel: null,
    executionUnits: [],
  };
  return {
    ...definition,
    executionSpec: nextSpec,
  };
}

function buildExecutionDefinitionsFromWorkOrder(workOrder: any): ProjectExecutionDefinitionItem[] {
  const offerVersionId = workOrder?.offerVersionId ? String(workOrder.offerVersionId) : null;
  return (Array.isArray(workOrder?.items) ? workOrder.items : [])
    .filter((item: any) => !item?.isExtra)
    .map((item: any) => buildExecutionDefinitionItem({ item, offerVersionId }));
}

function getExecutionUnitProjectLocationKey(unit: any) {
  const projectLocationId = typeof unit?.projectLocationId === 'string' ? unit.projectLocationId.trim() : '';
  if (projectLocationId) return projectLocationId;
  const sourcePhotoItemId = typeof unit?.sourcePhotoItemId === 'string' ? unit.sourcePhotoItemId.trim() : '';
  if (sourcePhotoItemId) return sourcePhotoItemId;
  return '';
}

function sanitizeProjectExecutionLocations(input: any[]) {
  return (Array.isArray(input) ? input : [])
    .map((location: any) => {
      const id = typeof location?.id === 'string' && location.id.trim() ? location.id.trim() : '';
      if (!id) return null;
      return {
        id,
        name: typeof location?.name === 'string' ? location.name : '',
        note: typeof location?.note === 'string' ? location.note : '',
        sourcePhotoItemId:
          typeof location?.sourcePhotoItemId === 'string' && location.sourcePhotoItemId.trim()
            ? location.sourcePhotoItemId.trim()
            : id.startsWith('zahteva-')
              ? id
              : null,
      };
    })
    .filter((location): location is NonNullable<typeof location> => Boolean(location));
}

function mergeProjectExecutionLocations(existingLocations: any[], definitions: any[]) {
  const byId = new Map<string, any>();
  for (const location of sanitizeProjectExecutionLocations(existingLocations)) {
    byId.set(location.id, location);
  }

  for (const definition of definitions ?? []) {
    const units = Array.isArray(definition?.executionSpec?.executionUnits) ? definition.executionSpec.executionUnits : [];
    for (const unit of units) {
      const id = getExecutionUnitProjectLocationKey(unit);
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name: typeof unit?.location === 'string' ? unit.location : '',
        note: typeof unit?.instructions === 'string' ? unit.instructions : '',
        sourcePhotoItemId:
          typeof unit?.sourcePhotoItemId === 'string' && unit.sourcePhotoItemId.trim()
            ? unit.sourcePhotoItemId.trim()
            : id.startsWith('zahteva-')
              ? id
              : null,
      });
    }
  }

  return Array.from(byId.values());
}

function applyProjectLocationMemoryToDefinitions(
  incomingDefinitions: ProjectExecutionDefinitionItem[],
  currentDefinitions: any[],
) {
  const memoryByLocation = new Map<string, any>();
  for (const definition of currentDefinitions ?? []) {
    const units = Array.isArray(definition?.executionSpec?.executionUnits) ? definition.executionSpec.executionUnits : [];
    for (const unit of units) {
      const key = getExecutionUnitProjectLocationKey(unit);
      if (!key) continue;
      memoryByLocation.set(key, unit);
    }
  }

  if (memoryByLocation.size === 0) return incomingDefinitions;

  return incomingDefinitions.map((definition) => {
    const spec = sanitizeExecutionSpec(definition.executionSpec);
    if (!spec || !Array.isArray(spec.executionUnits) || spec.executionUnits.length === 0) return definition;
    const executionUnits = spec.executionUnits.map((unit: any) => {
      const key = getExecutionUnitProjectLocationKey(unit);
      const remembered = key ? memoryByLocation.get(key) : null;
      if (!remembered) return unit;
      return {
        ...unit,
        label: typeof remembered.label === 'string' && remembered.label.trim() ? remembered.label : unit.label,
        location: typeof remembered.location === 'string' ? remembered.location : unit.location,
        instructions: typeof remembered.instructions === 'string' ? remembered.instructions : unit.instructions,
        note: typeof remembered.note === 'string' || remembered.note === null ? remembered.note : unit.note,
      };
    });
    return {
      ...definition,
      executionSpec: {
        ...spec,
        locationSummary: executionUnits.map((unit: any) => unit.location).filter(Boolean).join(', '),
        executionUnits,
      },
    };
  });
}

function applyProjectLocationMemoryToWorkOrderItems(items: any[], currentDefinitions: any[]) {
  const definitionLikeItems = items.map((item) => buildExecutionDefinitionItem({ item, offerVersionId: item?.offerVersionId ?? null }));
  const rememberedDefinitions = applyProjectLocationMemoryToDefinitions(definitionLikeItems, currentDefinitions);
  const rememberedByItemId = new Map<string, any>();
  rememberedDefinitions.forEach((definition) => {
    const key = String(definition.offerItemId ?? definition.id ?? '');
    if (key) rememberedByItemId.set(key, definition);
  });
  return items.map((item) => {
    const key = String(item?.offerItemId ?? item?.id ?? '');
    const remembered = rememberedByItemId.get(key);
    return remembered?.executionSpec ? { ...item, executionSpec: remembered.executionSpec } : item;
  });
}

function hasProjectLocationUnits(definition: any) {
  const units = Array.isArray(definition?.executionSpec?.executionUnits) ? definition.executionSpec.executionUnits : [];
  return units.some((unit: any) => Boolean(getExecutionUnitProjectLocationKey(unit)));
}

function mergeProjectExecutionDefinitions(params: {
  currentDefinitions: any[];
  incomingDefinitions: ProjectExecutionDefinitionItem[];
  offerVersionId?: string | null;
  preferIncomingExecutionSpec?: boolean;
}) {
  const { currentDefinitions, incomingDefinitions, offerVersionId, preferIncomingExecutionSpec = false } = params;
  const incomingKeys = new Set<string>();
  const currentByKey = new Map<string, any>();
  for (const definition of currentDefinitions ?? []) {
    const itemKey = String(definition?.offerItemId ?? definition?.id ?? '');
    const key = `${String(definition?.offerVersionId ?? '')}:${itemKey}`;
    if (itemKey) currentByKey.set(key, definition);
  }

  const mergedIncoming = incomingDefinitions.map((definition) => {
    const itemKey = String(definition.offerItemId ?? definition.id);
    const key = `${String(definition.offerVersionId ?? offerVersionId ?? '')}:${itemKey}`;
    incomingKeys.add(key);
    const existing = currentByKey.get(key);
    return {
      ...definition,
      executionSpec: preferIncomingExecutionSpec
        ? sanitizeExecutionSpec(definition.executionSpec) ?? sanitizeExecutionSpec(existing?.executionSpec)
        : sanitizeExecutionSpec(existing?.executionSpec) ?? sanitizeExecutionSpec(definition.executionSpec),
    };
  });

  const retained = (currentDefinitions ?? []).filter((definition) => {
    const itemKey = String(definition?.offerItemId ?? definition?.id ?? '');
    const key = `${String(definition?.offerVersionId ?? '')}:${itemKey}`;
    if (!itemKey || incomingKeys.has(key)) return false;
    if (offerVersionId && String(definition?.offerVersionId ?? '') === offerVersionId) return false;
    return true;
  });

  const locationMemory = (currentDefinitions ?? [])
    .filter((definition) => {
      const itemKey = String(definition?.offerItemId ?? definition?.id ?? '');
      const key = `${String(definition?.offerVersionId ?? '')}:${itemKey}`;
      return Boolean(itemKey) && !incomingKeys.has(key) && offerVersionId && String(definition?.offerVersionId ?? '') === offerVersionId && hasProjectLocationUnits(definition);
    })
    .map((definition) => ({
      ...definition,
      id: `project-location-memory:${String(definition?.offerItemId ?? definition?.id ?? new Types.ObjectId().toString())}`,
      offerVersionId: null,
      offerItemId: String(definition?.offerItemId ?? definition?.id ?? ''),
    }));

  return [...retained, ...locationMemory, ...mergedIncoming];
}

function applyExecutionDefinitionsToWorkOrders(workOrders: any[], definitions: any[]) {
  if (!Array.isArray(workOrders) || !Array.isArray(definitions) || definitions.length === 0) {
    return workOrders;
  }
  const definitionsByKey = new Map<string, any>();
  for (const definition of definitions) {
    const key = String(definition?.offerItemId ?? definition?.id ?? '');
    const offerKey = String(definition?.offerVersionId ?? '');
    if (key) definitionsByKey.set(`${offerKey}:${key}`, definition);
  }
  return workOrders.map((workOrder) => ({
    ...workOrder,
    items: (workOrder.items ?? []).map((item: any) => {
      const key = String(item?.offerItemId ?? item?.id ?? '');
      const offerKey = String(workOrder?.offerVersionId ?? '');
      const definition = key ? definitionsByKey.get(`${offerKey}:${key}`) : null;
      if (!definition) return item;
      return {
        ...item,
        executionSpec: sanitizeExecutionSpec(definition.executionSpec) ?? sanitizeExecutionSpec(item.executionSpec),
      };
    }),
  }));
}

async function syncProjectExecutionDefinitionsFromWorkOrder(projectId: string, workOrder: any) {
  if (!workOrder) return;
  const project = await ProjectModel.findOne({ id: projectId });
  if (!project) return;
  const incomingDefinitions = buildExecutionDefinitionsFromWorkOrder(workOrder);
  project.executionDefinitions = mergeProjectExecutionDefinitions({
    currentDefinitions: Array.isArray(project.executionDefinitions) ? project.executionDefinitions : [],
    incomingDefinitions,
    offerVersionId: workOrder.offerVersionId ? String(workOrder.offerVersionId) : null,
    preferIncomingExecutionSpec: true,
  });
  await project.save();
}

async function syncWorkOrdersFromProjectExecutionDefinitions(projectId: string, offerVersionId?: string | null) {
  const project = await ProjectModel.findOne({ id: projectId }).lean();
  if (!project || !Array.isArray((project as any).executionDefinitions)) return;
  const definitionsByKey = new Map<string, any>();
  for (const definition of (project as any).executionDefinitions) {
    if (offerVersionId && String(definition?.offerVersionId ?? '') !== offerVersionId) continue;
    const key = String(definition?.offerItemId ?? definition?.id ?? '');
    const offerKey = String(definition?.offerVersionId ?? '');
    if (key) definitionsByKey.set(`${offerKey}:${key}`, definition);
  }
  if (definitionsByKey.size === 0) return;

  const query: Record<string, unknown> = { projectId, cancelledAt: null };
  if (offerVersionId) query.offerVersionId = offerVersionId;
  const workOrders = await WorkOrderModel.find(query);
  for (const workOrder of workOrders) {
    let changed = false;
    workOrder.items = (workOrder.items ?? []).map((item: any) => {
      const plain = item?.toObject ? item.toObject() : item;
      const key = String(plain?.offerItemId ?? plain?.id ?? '');
      const offerKey = String(workOrder?.offerVersionId ?? '');
      const definition = key ? definitionsByKey.get(`${offerKey}:${key}`) : null;
      if (!definition) return item;
      changed = true;
      return {
        ...plain,
        executionSpec: sanitizeIncomingExecutionSpec(definition.executionSpec, plain.executionSpec, null, false),
      };
    });
    if (changed) {
      await workOrder.save();
    }
  }
}

async function ensureWorkOrderForOffer(params: {
  projectId: string;
  offerId: string;
  items: ReturnType<typeof mapOfferItemsToWorkOrderItems>;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  productDefaultsById: Map<string, any>;
}) {
  const { projectId, offerId, items, customerName, customerEmail, customerPhone, customerAddress, productDefaultsById } = params;
  let workOrder = await WorkOrderModel.findOne({ projectId, offerVersionId: offerId }).sort({ sequence: 1, createdAt: 1 });

  if (workOrder) {
    if ((workOrder as any).status === 'cancelled') {
      (workOrder as any).status = 'draft';
    }
    workOrder.items = mergeGeneratedWorkOrderItems(workOrder.items ?? [], items, productDefaultsById);
    workOrder.cancelledAt = null;
    workOrder.reopened = false;
    workOrder.customerName = customerName;
    workOrder.customerEmail = customerEmail;
    workOrder.customerPhone = customerPhone;
    workOrder.customerAddress = customerAddress;
    if (typeof workOrder.sequence !== 'number') {
      workOrder.sequence = 1;
    }
    await workOrder.save();
    return workOrder;
  }

  return WorkOrderModel.create({
    projectId,
    offerVersionId: offerId,
    sequence: 1,
    items,
    status: 'draft',
    reopened: false,
    scheduledAt: null,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
  });
}

async function ensureMaterialOrderForOffer(params: {
  projectId: string;
  offerId: string;
  workOrderId: string;
  items: LogisticsItems;
}) {
  const { projectId, offerId, items, workOrderId } = params;
  let materialOrder =
    (await MaterialOrderModel.findOne({ projectId, offerVersionId: offerId, workOrderId }).sort({ createdAt: 1 })) ||
    (await MaterialOrderModel.findOne({ projectId, offerVersionId: offerId }).sort({ createdAt: 1 }));

  if (materialOrder) {
    if (materialOrder.status === 'cancelled') {
      materialOrder.status = 'draft';
    }
    const existingItems = new Map<string, any>(
      (materialOrder.items ?? []).map((item: any) => [String(item.id), item])
    );
    const extraItems = (materialOrder.items ?? [])
      .map((item: any) => normalizeSupplierFields(item.toObject ? item.toObject() : item))
      .filter((item: any) => item?.isExtra);
    materialOrder.items = [
      ...items.map((item) => ({
        ...item,
        isOrdered:
          typeof existingItems.get(item.id)?.isOrdered === 'boolean' ? existingItems.get(item.id).isOrdered : false,
        orderedQty:
          typeof existingItems.get(item.id)?.orderedQty === 'number' ? existingItems.get(item.id).orderedQty : 0,
        deliveredQty:
          typeof existingItems.get(item.id)?.deliveredQty === 'number' ? existingItems.get(item.id).deliveredQty : 0,
        supplierKey:
          typeof existingItems.get(item.id)?.supplierKey === 'string'
            ? existingItems.get(item.id).supplierKey
            : normalizeSupplierKey(item.dobavitelj, item.naslovDobavitelja),
        materialStep:
          typeof existingItems.get(item.id)?.materialStep === 'string'
            ? existingItems.get(item.id).materialStep
            : item.materialStep ?? 'Za naro?iti',
        isExtra: false,
      })),
      ...extraItems,
    ];
    materialOrder.workOrderId = workOrderId;
    materialOrder.materialStatus = materialOrder.materialStatus ?? 'Za naročit';
    materialOrder.cancelledAt = null;
    materialOrder.reopened = false;
    await materialOrder.save();
    return materialOrder;
  }

  return MaterialOrderModel.create({
    projectId,
    offerVersionId: offerId,
    workOrderId,
    items,
    pickupMethod: 'SUPPLIER_PICKUP',
    status: 'draft',
    materialStatus: 'Za naročit',
    reopened: false,
  });
}

function serializeMaterialOrder(order: any): MaterialOrder | null {
  if (!order) return null;
  return {
    _id: String(order._id),
    projectId: order.projectId,
    offerVersionId: order.offerVersionId,
    workOrderId: order.workOrderId ? String(order.workOrderId) : undefined,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      isOrdered: typeof item.isOrdered === 'boolean' ? item.isOrdered : false,
      orderedQty: typeof item.orderedQty === 'number' ? item.orderedQty : 0,
      deliveredQty: typeof item.deliveredQty === 'number' ? item.deliveredQty : 0,
      unit: item.unit,
      note: item.note,
      dobavitelj: item.dobavitelj,
      naslovDobavitelja: item.naslovDobavitelja,
      supplierKey: typeof item.supplierKey === 'string' ? item.supplierKey : normalizeSupplierKey(item.dobavitelj, item.naslovDobavitelja),
      materialStep: typeof item.materialStep === 'string' ? item.materialStep : 'Za naročiti',
      offerItemId: item.offerItemId ?? null,
      offeredQuantity:
        typeof item.offeredQuantity === 'number' ? item.offeredQuantity : Number(item.quantity) || 0,
      plannedQuantity:
        typeof item.plannedQuantity === 'number' ? item.plannedQuantity : Number(item.quantity) || 0,
      executedQuantity:
        typeof item.executedQuantity === 'number' ? item.executedQuantity : Number(item.quantity) || 0,
      isExtra: !!item.isExtra,
      itemNote: typeof item.itemNote === 'string' ? item.itemNote : null,
      isCompleted: !!item.isCompleted,
    })),
    status: order.status,
    materialStatus: order.materialStatus ?? 'Za naročit',
    assignedEmployeeIds: Array.isArray(order.assignedEmployeeIds)
      ? order.assignedEmployeeIds.map((id: any) => String(id))
      : [],
    pickupMethod: typeof order.pickupMethod === 'string' ? order.pickupMethod : null,
    pickupLocation: typeof order.pickupLocation === 'string' ? order.pickupLocation : null,
    logisticsOwnerId: order.logisticsOwnerId ? String(order.logisticsOwnerId) : null,
    pickupNote: typeof order.pickupNote === 'string' ? order.pickupNote : null,
    expectedAt: order.expectedAt ? new Date(order.expectedAt).toISOString() : null,
    pickupConfirmedAt: order.pickupConfirmedAt ? new Date(order.pickupConfirmedAt).toISOString() : null,
    pickupConfirmedBy: typeof order.pickupConfirmedBy === 'string' ? order.pickupConfirmedBy : null,
    cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
    reopened: !!order.reopened,
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
  };
}

async function buildProductServiceFlagMap(productIds: Array<string | null | undefined>) {
  const uniqueIds = Array.from(
    new Set(
      productIds
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
  const productServiceFlags = new Map<string, boolean>();
  if (uniqueIds.length === 0) return productServiceFlags;

  const products = await ProductModel.find({ _id: { $in: uniqueIds } }).select('_id isService').lean();
  products.forEach((product) => {
    productServiceFlags.set(String(product._id), product.isService === true);
  });
  return productServiceFlags;
}

function normalizeWorkOrderItemsWithProductTruth(items: any[], productServiceFlags: Map<string, boolean>) {
  let changed = false;
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
    const normalizedProductId =
      typeof item?.productId === 'string' && item.productId.trim().length > 0 ? item.productId.trim() : null;
    const nextIsService = normalizedProductId
      ? productServiceFlags.get(normalizedProductId) ?? (typeof item?.isService === 'boolean' ? item.isService : false)
      : typeof item?.isService === 'boolean'
        ? item.isService
        : false;

    if (item?.productId !== normalizedProductId || item?.isService !== nextIsService) {
      changed = true;
    }

    return {
      ...(item?.toObject ? item.toObject() : item),
      productId: normalizedProductId,
      isService: nextIsService,
    };
  });

  return { normalizedItems, changed };
}

async function normalizeAndPersistWorkOrdersServiceFlags(workOrders: any[]) {
  if (!Array.isArray(workOrders) || workOrders.length === 0) return [];

  const productServiceFlags = await buildProductServiceFlagMap(
    workOrders.flatMap((workOrder) =>
      Array.isArray(workOrder?.items) ? workOrder.items.map((item: any) => item?.productId ?? null) : []
    )
  );

  const normalizedEntries = workOrders.map((workOrder) => {
    const { normalizedItems, changed } = normalizeWorkOrderItemsWithProductTruth(workOrder?.items ?? [], productServiceFlags);
    return {
      workOrder,
      changed,
      normalized: {
        ...(workOrder?.toObject ? workOrder.toObject() : workOrder),
        items: normalizedItems,
      },
    };
  });

  const bulkUpdates = normalizedEntries
    .filter((entry) => entry.changed && entry.normalized?._id)
    .map((entry) => ({
      updateOne: {
        filter: { _id: entry.normalized._id },
        update: { $set: { items: entry.normalized.items } },
      },
    }));

  if (bulkUpdates.length > 0) {
    await WorkOrderModel.bulkWrite(bulkUpdates, { ordered: false });
  }

  return normalizedEntries.map((entry) => entry.normalized);
}

function serializeWorkOrder(order: any): WorkOrder | null {
  if (!order) return null;
  const confirmationState = resolveConfirmationState(order);
  const activeConfirmationVersion = getActiveSignedConfirmationVersion(order);
  const confirmationVersions = getConfirmationVersions(order);
  return {
    _id: String(order._id),
    projectId: order.projectId,
    offerVersionId: order.offerVersionId,
    sequence: typeof order.sequence === 'number' ? order.sequence : null,
    code: order.code ?? null,
    title: order.title ?? null,
      items: (order.items || []).map((item: any) => {
        const fallbackQuantity = typeof item.quantity === 'number' ? item.quantity : 0;
        return {
          id: item.id,
          productId: item.productId ?? null,
          name: item.name,
          quantity: fallbackQuantity,
          unit: item.unit,
          isService: item.isService === true,
          note: item.note ?? undefined,
          offerItemId: item.offerItemId ?? null,
          offeredQuantity:
            typeof item.offeredQuantity === 'number' ? item.offeredQuantity : fallbackQuantity,
          plannedQuantity:
            typeof item.plannedQuantity === 'number' ? item.plannedQuantity : fallbackQuantity,
          executedQuantity:
            typeof item.executedQuantity === 'number' ? item.executedQuantity : fallbackQuantity,
          isExtra: !!item.isExtra,
          itemNote:
            typeof item.itemNote === 'string'
              ? item.itemNote
              : item.itemNote === null
                ? null
                : undefined,
          isCompleted: !!item.isCompleted,
          completedBy: normalizeExecutionUnitEmployeeId(item.completedBy),
          completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : null,
          casovnaNorma:
            typeof item.casovnaNorma === 'number' && Number.isFinite(item.casovnaNorma)
              ? item.casovnaNorma
              : 0,
          timeTracking: serializeWorkOrderTimeTracking(item.timeTracking),
          executionSpec: sanitizeExecutionSpec(item.executionSpec),
        };
      }),
    status: order.status,
    completedAt: order.completedAt ? new Date(order.completedAt).toISOString() : null,
    scheduledAt: order.scheduledAt ?? null,
    scheduledConfirmedAt: order.scheduledConfirmedAt
      ? new Date(order.scheduledConfirmedAt).toISOString()
      : order.scheduleConfirmedAt
        ? new Date(order.scheduleConfirmedAt).toISOString()
        : null,
    scheduledConfirmedBy: typeof order.scheduledConfirmedBy === 'string' ? order.scheduledConfirmedBy : null,
    mainInstallerId: order.mainInstallerId ? String(order.mainInstallerId) : null,
    assignedEmployeeIds: Array.isArray(order.assignedEmployeeIds)
      ? order.assignedEmployeeIds.map((id: any) => String(id))
      : [],
    location: order.location,
    notes: order.notes,
    customerName: order.customerName ?? '',
    customerEmail: order.customerEmail ?? '',
    customerPhone: order.customerPhone ?? '',
    customerAddress: order.customerAddress ?? '',
    customerSignerName: activeConfirmationVersion?.signerName ?? null,
    customerSignature: activeConfirmationVersion?.signature ?? null,
    customerSignedAt: activeConfirmationVersion?.signedAt ? new Date(activeConfirmationVersion.signedAt).toISOString() : null,
    customerRemark: activeConfirmationVersion?.customerRemark ?? null,
    executionNote:
      typeof order.executionNote === 'string'
        ? order.executionNote
        : order.executionNote === null
          ? null
          : undefined,
    cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
    reopened: !!order.reopened,
    workLogs: (order.workLogs ?? []).map((log: any) => ({
      employeeId: typeof log.employeeId === 'string' ? log.employeeId : '',
      hours: typeof log.hours === 'number' ? log.hours : 0,
    })),
    confirmationState,
    confirmationActiveVersionId: activeConfirmationVersion?.id ?? null,
    activeConfirmationVersion: activeConfirmationVersion
      ? {
          id: activeConfirmationVersion.id,
          versionNumber: activeConfirmationVersion.versionNumber,
          state: activeConfirmationVersion.state,
          signerName: activeConfirmationVersion.signerName,
          customerRemark: activeConfirmationVersion.customerRemark ?? null,
          signature: activeConfirmationVersion.signature,
          signedAt: activeConfirmationVersion.signedAt ? new Date(activeConfirmationVersion.signedAt).toISOString() : null,
        }
      : null,
    confirmationVersions: confirmationVersions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      state: version.state,
      signerName: version.signerName,
      customerRemark: version.customerRemark ?? null,
      signature: version.signature,
      signedAt: version.signedAt ? new Date(version.signedAt).toISOString() : null,
    })),
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
  };
}

function sanitizeIncomingExecutionSpec(
  input: any,
  existingSpec?: any,
  actorEmployeeId?: string | null,
  allowCompletionAssigneeOverride = false,
) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const existingUnitsById = new Map<string, any>();
  if (Array.isArray(existingSpec?.executionUnits)) {
    existingSpec.executionUnits.forEach((unit: any) => {
      if (typeof unit?.id === 'string') {
        existingUnitsById.set(unit.id, unit);
      }
    });
  }
  const executionUnits = Array.isArray(input.executionUnits)
    ? input.executionUnits
        .map((unit: any) => {
          const label = typeof unit?.label === 'string' ? unit.label.trim() : '';
          if (!label) return null;
          const unitId =
            typeof unit?.id === 'string' && unit.id.trim().length > 0
              ? unit.id.trim()
              : new Types.ObjectId().toString();
          const existingUnit = existingUnitsById.get(unitId);
          const isCompleted = !!unit?.isCompleted;
          const wasCompleted = !!existingUnit?.isCompleted;
          const incomingCompletedBy = normalizeExecutionUnitEmployeeId(unit?.completedBy);
          const existingCompletedBy =
            normalizeExecutionUnitEmployeeId(existingUnit?.completedBy) ??
            normalizeExecutionUnitEmployeeId(existingUnit?.completedByEmployeeId);
          const preferredCompletedBy = allowCompletionAssigneeOverride ? incomingCompletedBy : null;
          const completedBy = isCompleted
            ? preferredCompletedBy ?? (wasCompleted ? existingCompletedBy : actorEmployeeId) ?? incomingCompletedBy ?? existingCompletedBy
            : null;
          const incomingCompletedAt = normalizeExecutionUnitCompletedAt(unit?.completedAt);
          const existingCompletedAt = normalizeExecutionUnitCompletedAt(existingUnit?.completedAt);
          const completedAt = isCompleted ? (wasCompleted ? existingCompletedAt : null) ?? incomingCompletedAt ?? new Date() : null;
          return {
            id: unitId,
            label,
            projectLocationId:
              typeof unit?.projectLocationId === 'string' && unit.projectLocationId.trim().length > 0
                ? unit.projectLocationId.trim()
                : typeof unit?.sourcePhotoItemId === 'string' && unit.sourcePhotoItemId.trim().length > 0
                  ? unit.sourcePhotoItemId.trim()
                  : null,
            sourcePhotoItemId:
              typeof unit?.sourcePhotoItemId === 'string' && unit.sourcePhotoItemId.trim().length > 0
                ? unit.sourcePhotoItemId.trim()
                : null,
            location: typeof unit?.location === 'string' ? unit.location : unit?.location === null ? null : null,
            instructions:
              typeof unit?.instructions === 'string'
                ? unit.instructions
                : unit?.instructions === null
                  ? null
                  : null,
            isCompleted,
            completedBy,
            completedAt,
            completedByEmployeeId: completedBy ?? normalizeExecutionUnitEmployeeId(unit?.completedByEmployeeId),
            executedBy: normalizeExecutionUnitEmployeeId(unit?.executedBy),
            executedByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.executedByEmployeeId),
            markedDoneBy: normalizeExecutionUnitEmployeeId(unit?.markedDoneBy),
            markedDoneByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.markedDoneByEmployeeId),
            doneBy: normalizeExecutionUnitEmployeeId(unit?.doneBy),
            doneByEmployeeId: normalizeExecutionUnitEmployeeId(unit?.doneByEmployeeId),
            note: typeof unit?.note === 'string' ? unit.note : unit?.note === null ? null : null,
          };
        })
        .filter((unit): unit is NonNullable<typeof unit> => unit !== null)
    : [];

  return {
    mode: normalizeExecutionMode(input.mode),
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
    executionUnits,
  };
}

function resolveScheduleConfirmerLabel(req: Request) {
  const authEmployeeName =
    typeof (req as any).authEmployee?.name === 'string' ? (req as any).authEmployee.name.trim() : '';
  if (authEmployeeName) return authEmployeeName;

  const userName = typeof (req as any).user?.name === 'string' ? (req as any).user.name.trim() : '';
  if (userName) return userName;

  const userEmail = typeof (req as any).user?.email === 'string' ? (req as any).user.email.trim() : '';
  if (userEmail) return userEmail;

  return resolveActorId(req);
}

function isMaterialItemReadyForIssue(item: any) {
  const plannedQty = typeof item?.quantity === 'number' && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
  if (plannedQty <= 0) return true;
  const orderedQty = typeof item?.orderedQty === 'number' && Number.isFinite(item.orderedQty) ? Math.max(0, item.orderedQty) : 0;
  const step = resolveMaterialStep(item?.materialStep);
  return orderedQty >= plannedQty && (step === 'Za prevzem' || step === 'Prevzeto' || step === 'Pripravljeno');
}

async function getPreparationReadiness(projectId: string, workOrderId: string) {
  const [workOrder, materialOrders] = await Promise.all([
    WorkOrderModel.findOne({ _id: workOrderId, projectId, cancelledAt: null }).lean(),
    MaterialOrderModel.find({ projectId, workOrderId, status: { $ne: 'cancelled' }, cancelledAt: null }).lean(),
  ]);
  if (!workOrder) return { ready: false };

  const assignedEmployeeIds = Array.isArray(workOrder.assignedEmployeeIds) ? workOrder.assignedEmployeeIds : [];
  const hasAssignedTeam = assignedEmployeeIds.length > 0;
  const hasSchedule = typeof workOrder.scheduledAt === 'string' && workOrder.scheduledAt.trim().length > 0;
  const hasConfirmedSchedule = Boolean(workOrder.scheduledConfirmedAt);
  const materialItems = materialOrders.flatMap((order: any) => (order.items ?? []).filter((item: any) => !item.isExtra));
  const materialReady = materialItems.length === 0 || materialItems.every(isMaterialItemReadyForIssue);

  return {
    ready: hasAssignedTeam && hasSchedule && hasConfirmedSchedule && materialReady,
    workOrder,
  };
}

async function moveProjectToExecution(params: {
  projectId: string;
  workOrderId: string;
  req: Request;
  mode: 'automatic' | 'manual';
}) {
  const { projectId, workOrderId, req, mode } = params;
  const project = await ProjectModel.findOne({ id: projectId });
  if (!project || project.status !== 'ordered') return false;

  project.status = 'in-progress';
  addTimeline(project, {
    type: 'status-change',
    title: mode === 'automatic' ? 'Avtomatski prehod faze' : 'Status spremenjen',
    description:
      mode === 'automatic'
        ? "Projekt je samodejno prešel v fazo 'Izvedba', ker so zahteve priprave izpolnjene."
        : "Projekt prešel v fazo 'Izvedba' po izdaji delovnega naloga.",
    timestamp: new Date().toISOString(),
    user: buildActorDisplayName(req as any),
    metadata: {
      workOrderId,
      mode,
      actorEmployeeId: resolveActorEmployeeId(req) ?? '',
    },
  });
  await project.save();
  return true;
}

async function applyAutomaticPreparationProgression(projectId: string, workOrderId: string, req: Request) {
  const settings = await getSettings();
  if (settings.phaseProgressionMode !== 'automatic') return false;

  const readiness = await getPreparationReadiness(projectId, workOrderId);
  if (!readiness.ready) return false;

  const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
  if (!workOrder || workOrder.status === 'issued' || workOrder.status === 'in-progress' || workOrder.status === 'completed') {
    return false;
  }
  workOrder.status = 'issued';
  await workOrder.save();
  return moveProjectToExecution({ projectId, workOrderId, req, mode: 'automatic' });
}

async function resolveEmployeeIdForTenant(tenantId: string, value: unknown) {
  const nextId = typeof value === 'string' ? value.trim() : '';
  if (!nextId) {
    return { id: null as string | null };
  }
  if (!mongoose.isValidObjectId(nextId)) {
    return { error: 'Neveljaven zaposleni.' };
  }
  const match = await EmployeeModel.findOne({ _id: nextId, tenantId }).select('_id').lean();
  if (!match) {
    return { error: 'Zaposleni ne pripada tenantu.' };
  }
  return { id: nextId };
}

async function buildLogisticsSnapshot(projectId: string): Promise<ProjectLogisticsSnapshot | null> {
  const project = await ProjectModel.findOne({ id: projectId }).lean();
  if (!project) return null;

  const offerVersions = await OfferVersionModel.find({ projectId }).sort({ versionNumber: 1 }).lean();
  const fallbackConfirmedOfferId =
    project.confirmedOfferVersionId ??
    (offerVersions.find((offer) => (offer.status ?? '').toLowerCase() === 'accepted')?._id ?? null);
  const confirmedOfferVersionId = fallbackConfirmedOfferId ? String(fallbackConfirmedOfferId) : null;

  const materialOrderQuery = {
    projectId,
    status: { $ne: 'cancelled' },
    cancelledAt: null,
  };

  const workOrderQuery = {
    projectId,
    cancelledAt: null,
  };

  const [materialOrderDocs, workOrderDocs] = await Promise.all([
    MaterialOrderModel.find(materialOrderQuery).sort({ createdAt: 1 }).lean(),
    WorkOrderModel.find(workOrderQuery).sort({ sequence: 1, createdAt: 1 }).lean(),
  ]);
  const normalizedWorkOrderDocs = await normalizeAndPersistWorkOrdersServiceFlags(workOrderDocs);
  const workOrderDocsWithProjectDefinitions = applyExecutionDefinitionsToWorkOrders(
    normalizedWorkOrderDocs,
    Array.isArray((project as any).executionDefinitions) ? (project as any).executionDefinitions : [],
  );

  const resolveTotalWithVat = (offer: any) => {
    const sumFromItems =
      offer?.items?.reduce((sum: number, item: any) => sum + (item?.totalGross ?? 0), 0) ?? 0;
    return (
      offer?.totalWithVat ??
      offer?.totalGrossAfterDiscount ??
      offer?.totalGross ??
      offer?.totalNetAfterDiscount ??
      sumFromItems
    );
  };

  const serializedMaterialOrders: MaterialOrder[] = materialOrderDocs
    .map(serializeMaterialOrder)
    .filter((order): order is MaterialOrder => order !== null);
  const serializedWorkOrders: WorkOrder[] = workOrderDocsWithProjectDefinitions
    .map(serializeWorkOrder)
    .filter((order): order is WorkOrder => order !== null);

  return {
    projectId,
    confirmedOfferVersionId,
    offerVersions: offerVersions.map((offer) => ({
      _id: String(offer._id),
      title: offer.title,
      versionNumber: offer.versionNumber,
      status: offer.status,
      totalWithVat: resolveTotalWithVat(offer),
    })),
    materialOrders: serializedMaterialOrders,
    workOrders: serializedWorkOrders,
    materialOrder: confirmedOfferVersionId
      ? serializedMaterialOrders.find((order) => order.offerVersionId === confirmedOfferVersionId) ??
        serializedMaterialOrders[0] ??
        null
      : serializedMaterialOrders[0] ?? null,
    workOrder: confirmedOfferVersionId
      ? serializedWorkOrders.find((order) => order.offerVersionId === confirmedOfferVersionId) ??
        serializedWorkOrders[0] ??
        null
      : serializedWorkOrders[0] ?? null,
  };
}

async function resolveExecutionDefinitionOffer(projectId: string, requestedOfferId?: string | null) {
  const query = requestedOfferId
    ? { _id: requestedOfferId, projectId }
    : { projectId };
  return requestedOfferId
    ? OfferVersionModel.findOne(query).lean()
    : OfferVersionModel.findOne(query).sort({ status: -1, versionNumber: -1, createdAt: -1 }).lean();
}

async function ensureProjectExecutionDefinitions(projectId: string, requestedOfferId?: string | null) {
  const project = await ProjectModel.findOne({ id: projectId });
  if (!project) return null;

  const offerId = requestedOfferId ?? project.confirmedOfferVersionId ?? null;
  const offer = await resolveExecutionDefinitionOffer(projectId, offerId);
  const resolvedOfferId = offer?._id ? String(offer._id) : offerId;
  const offerItems = Array.isArray((offer as any)?.items) ? ((offer as any).items as OfferLineItem[]) : [];
  const fallbackUnitsByProductId = offer
    ? await buildRequirementLocationUnitFallbacks(project, offer)
    : new Map<string, Array<{ locationId: string; locationName: string; sourcePhotoItemId: string; projectLocationId: string }>>();
  const offerItemsWithLocationFallbacks = withRequirementLocationFallbacks(offerItems, fallbackUnitsByProductId);
  const currentDefinitions = Array.isArray(project.executionDefinitions) ? project.executionDefinitions : [];

  if (resolvedOfferId) {
    const workOrder = await WorkOrderModel.findOne({
      projectId,
      offerVersionId: resolvedOfferId,
      cancelledAt: null,
    }).lean();
    let incomingDefinitions: ProjectExecutionDefinitionItem[] = [];

    if (workOrder) {
      incomingDefinitions = buildExecutionDefinitionsFromWorkOrder(workOrder);
    } else if (offer) {
      const productIds = offerItemsWithLocationFallbacks
        .map((item: any) => (item.productId ? String(item.productId) : null))
        .filter((id: string | null): id is string => Boolean(id));
      const serviceProductIds = new Set<string>();
      const productDefaultsById = new Map<string, any>();
      if (productIds.length > 0) {
        const products = await ProductModel.find({ _id: { $in: productIds } })
          .select('_id isService defaultExecutionMode defaultInstructionsTemplate')
          .lean();
        products.forEach((product) => {
          productDefaultsById.set(String(product._id), product);
          if (product.isService) {
            serviceProductIds.add(String(product._id));
          }
        });
      }
      incomingDefinitions = mapOfferItemsToWorkOrderItems(offerItemsWithLocationFallbacks, serviceProductIds, productDefaultsById)
        .filter((item) => !item.isExtra)
        .map((item) => buildExecutionDefinitionItem({ item, offerVersionId: resolvedOfferId }));
    }

    if (incomingDefinitions.length > 0) {
      // Uskladi se ob vsaki spremembi ponudbe, ne le ob prvem obisku; merge
      // ohrani obstoječe razporeditve po lokacijah za postavke, ki ostajajo.
      const definitionSignature = (defs: any[]) =>
        JSON.stringify(
          defs
            .map((definition: any) => [
              String(definition?.offerItemId ?? definition?.id ?? ''),
              definition?.name ?? '',
              definition?.quantity ?? 0,
              definition?.unit ?? '',
              definition?.isService === true,
            ])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        );
      const currentForOffer = currentDefinitions.filter(
        (definition: any) => String(definition?.offerVersionId ?? '') === resolvedOfferId,
      );
      if (definitionSignature(incomingDefinitions) !== definitionSignature(currentForOffer)) {
        incomingDefinitions = applyProjectLocationMemoryToDefinitions(incomingDefinitions, currentDefinitions);
        project.executionDefinitions = mergeProjectExecutionDefinitions({
          currentDefinitions,
          incomingDefinitions,
          offerVersionId: resolvedOfferId,
        });
        await project.save();
      }
    }
  }

  let definitions = Array.isArray(project.executionDefinitions) ? project.executionDefinitions : [];
  const normalizedDefinitions = definitions.map((definition: any) => normalizeMeasuredExecutionDefinition(definition));
  if (JSON.stringify(definitions) !== JSON.stringify(normalizedDefinitions)) {
    project.executionDefinitions = normalizedDefinitions;
    await project.save();
    definitions = normalizedDefinitions;
  }
  const itemsForOffer = resolvedOfferId
    ? definitions.filter((definition: any) => String(definition?.offerVersionId ?? '') === resolvedOfferId)
    : definitions;
  const mergedLocations = mergeProjectExecutionLocations(project.executionLocations ?? [], [
    ...definitions,
    ...itemsForOffer,
  ]);
  const currentLocationsJson = JSON.stringify(sanitizeProjectExecutionLocations(project.executionLocations ?? []));
  const nextLocationsJson = JSON.stringify(mergedLocations);
  if (currentLocationsJson !== nextLocationsJson) {
    project.executionLocations = mergedLocations;
    await project.save();
  }

  return {
    project,
    offerVersionId: resolvedOfferId,
    locations: mergedLocations,
    items: itemsForOffer,
  };
}

export async function getProjectExecutionDefinition(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const requestedOfferId =
      typeof req.query.offerVersionId === 'string'
        ? req.query.offerVersionId.trim()
        : typeof req.query.offerId === 'string'
          ? req.query.offerId.trim()
          : null;
    const result = await ensureProjectExecutionDefinitions(projectId, requestedOfferId);
    if (!result) {
      return res.fail('Projekt ni najden.', 404);
    }
    return res.success({
      projectId,
      offerVersionId: result.offerVersionId,
      locations: result.locations,
      items: result.items,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProjectExecutionDefinition(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const requestedOfferId =
      typeof req.body?.offerVersionId === 'string' && req.body.offerVersionId.trim().length > 0
        ? req.body.offerVersionId.trim()
        : typeof req.query.offerVersionId === 'string'
          ? req.query.offerVersionId.trim()
          : null;
    const result = await ensureProjectExecutionDefinitions(projectId, requestedOfferId);
    if (!result) {
      return res.fail('Projekt ni najden.', 404);
    }
    const offerVersionId = requestedOfferId ?? result.offerVersionId ?? null;
    if (!Array.isArray(req.body?.items)) {
      return res.fail('Neveljavna definicija izvedbe.', 400);
    }

    const existingByKey = new Map<string, any>(
      (Array.isArray(result.project.executionDefinitions) ? result.project.executionDefinitions : [])
        .map((definition: any) => [
          `${String(definition?.offerVersionId ?? '')}:${String(definition?.offerItemId ?? definition?.id ?? '')}`,
          definition,
        ])
        .filter(([key]) => key.length > 0)
    );

    const incomingDefinitions = req.body.items.map((item: any) => {
      const definition = buildExecutionDefinitionItem({
        item: {
          ...item,
          offerVersionId,
          offerItemId: item?.offerItemId ?? item?.id,
        },
        offerVersionId,
      });
      const existing = existingByKey.get(`${String(offerVersionId ?? '')}:${String(definition.offerItemId ?? definition.id)}`);
      return normalizeMeasuredExecutionDefinition({
        ...definition,
        executionSpec: sanitizeIncomingExecutionSpec(definition.executionSpec, existing?.executionSpec, null, false),
      });
    });

    result.project.executionDefinitions = mergeProjectExecutionDefinitions({
      currentDefinitions: Array.isArray(result.project.executionDefinitions) ? result.project.executionDefinitions : [],
      incomingDefinitions,
      offerVersionId,
      preferIncomingExecutionSpec: true,
    });
    result.project.executionLocations = Array.isArray(req.body?.locations)
      ? sanitizeProjectExecutionLocations(req.body.locations)
      : mergeProjectExecutionLocations(result.project.executionLocations ?? [], incomingDefinitions);
    await result.project.save();
    await syncWorkOrdersFromProjectExecutionDefinitions(projectId, offerVersionId);

    const items = offerVersionId
      ? result.project.executionDefinitions.filter((definition: any) => String(definition?.offerVersionId ?? '') === offerVersionId)
      : result.project.executionDefinitions;
    return res.success({ projectId, offerVersionId, locations: result.project.executionLocations ?? [], items });
  } catch (err) {
    next(err);
  }
}

export async function confirmOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, offerId } = req.params;
    const [offer, project] = await Promise.all([
      OfferVersionModel.findOne({ _id: offerId, projectId }),
      ProjectModel.findOne({ id: projectId }),
    ]);

    if (!offer || !project) {
      return res.fail('Ponudba ni najdena.', 404);
    }

    const projectClient = await resolveProjectClient(project);
    const previousStatus = offer.status;
    offer.status = 'accepted';
    await offer.save();

    const offerTotals = calculateOfferTotalsFromSnapshot(offer as any);
    const updatePayload: Record<string, unknown> = {
      confirmedOfferVersionId: offerId,
      quotedTotal: offerTotals.baseWithoutVat,
      quotedVat: offerTotals.vatAmount,
      quotedTotalWithVat: offerTotals.totalWithVat,
      offerAmount: offerTotals.totalWithVat,
    };
    if (project.status !== 'completed') {
      updatePayload.status = 'ordered';
    }

    const updatedProject = await ProjectModel.findOneAndUpdate(
      { id: projectId },
      updatePayload,
      { new: true }
    );

    const offerItems = offer.items || [];
    const productIds = offerItems
      .map((item) => (item.productId ? String(item.productId) : null))
      .filter((id): id is string => Boolean(id));
    const serviceProductIds = new Set<string>();
    const productDefaultsById = new Map<string, any>();
    if (productIds.length > 0) {
      const products = await ProductModel.find({ _id: { $in: productIds } })
        .select('_id isService defaultExecutionMode defaultInstructionsTemplate')
        .lean();
      products.forEach((product) => {
        productDefaultsById.set(String(product._id), product);
        if (product.isService) {
          serviceProductIds.add(String(product._id));
        }
      });
    }
    const materialOfferItems = offerItems.filter(
      (item) => !item.productId || !serviceProductIds.has(String(item.productId))
    );
    const logisticsItems = mapOfferItemsToLogistics(materialOfferItems);
    const currentExecutionDefinitions = Array.isArray((project as any).executionDefinitions) ? (project as any).executionDefinitions : [];
    const workOrderItems = applyProjectLocationMemoryToWorkOrderItems(
      mapOfferItemsToWorkOrderItems(offerItems, serviceProductIds, productDefaultsById),
      currentExecutionDefinitions,
    );
    const customerName = project.customer?.name ?? projectClient?.name ?? '';
    const customerEmail = projectClient?.email ?? '';
    const customerPhone = projectClient?.phone ?? '';
    const customerAddress = formatClientAddress(projectClient, project.customer?.address ?? '');

    const workOrder = await ensureWorkOrderForOffer({
      projectId,
      offerId,
      items: workOrderItems,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      productDefaultsById,
    });

    await syncProjectExecutionDefinitionsFromWorkOrder(projectId, workOrder);

    await ensureMaterialOrderForOffer({
      projectId,
      offerId,
      workOrderId: String(workOrder._id),
      items: logisticsItems,
    });

      if (updatedProject) {
        addTimeline(updatedProject, {
          type: 'offer',
          title: previousStatus === 'cancelled' ? 'Ponovno potrjena ponudba' : 'Ponudba potrjena',
          description: `Verzija ${offer.title || offer.baseTitle || offerId}`,
          timestamp: new Date().toISOString(),
          user: 'system',
        });
        await updatedProject.save();
      }

      await recordOfferConfirmedCommunicationEvent({
        projectId,
        offerId,
        title: previousStatus === 'cancelled' ? 'Ponudba ponovno potrjena' : 'Ponudba potrjena',
        description: `Verzija ${offer.title || offer.baseTitle || offerId}`,
        user: buildActorDisplayName(req as any),
      });

      const finalProject = updatedProject ?? project;
    const payload = await serializeProjectDetails(finalProject, projectClient);
    return res.success(payload);
  } catch (err) {
    next(err);
  }
}

export async function cancelOfferConfirmation(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const project = await ProjectModel.findOne({ id: projectId });
    if (!project) {
      return res.fail('Projekt ni najden.', 404);
    }

    const query = req.query as Record<string, unknown>;
    const candidateOfferIds: Array<string | undefined> = [
      typeof req.body?.offerVersionId === 'string' ? req.body.offerVersionId.trim() : undefined,
      typeof req.body?.offerId === 'string' ? req.body.offerId.trim() : undefined,
      typeof query.offerVersionId === 'string' ? (query.offerVersionId as string).trim() : undefined,
      typeof query.offerId === 'string' ? (query.offerId as string).trim() : undefined,
    ];
    const requestedOfferId = candidateOfferIds.find((value) => value && value.length > 0) ?? null;
    const targetOfferId = requestedOfferId ?? project.confirmedOfferVersionId ?? null;

    if (!targetOfferId) {
      return res.fail('Ni potrjene ponudbe za preklic.', 400);
    }

    const offer = await OfferVersionModel.findOne({ _id: targetOfferId, projectId });
    if (!offer) {
      return res.fail('Ponudba ni najdena.', 404);
    }

    const projectClient = await resolveProjectClient(project);
    const now = new Date();

    offer.status = offer.sentAt ? 'sent' : 'draft';
    await offer.save();

    const replacementConfirmedOffer = await OfferVersionModel.findOne({
      projectId,
      status: 'accepted',
      _id: { $ne: targetOfferId },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (project.confirmedOfferVersionId === targetOfferId) {
      project.confirmedOfferVersionId = replacementConfirmedOffer ? String(replacementConfirmedOffer._id) : null;
    }

    if (project.status !== 'completed' && !replacementConfirmedOffer) {
      project.status = 'offered';
    }

    await MaterialOrderModel.updateMany(
      { projectId, offerVersionId: targetOfferId },
      { status: 'cancelled', cancelledAt: now, reopened: false }
    );

    await WorkOrderModel.updateMany(
      { projectId, offerVersionId: targetOfferId },
      { status: 'cancelled', cancelledAt: now, reopened: false }
    );

    addTimeline(project, {
      type: 'offer',
      title: 'Potrditev ponudbe preklicana',
      description: `Verzija ${offer.title || offer.baseTitle || targetOfferId}`,
      timestamp: now.toISOString(),
      user: 'system',
    });

    await project.save();

    const payload = await serializeProjectDetails(project, projectClient);
    return res.success(payload);
  } catch (err) {
    next(err);
  }
}

export async function getProjectLogistics(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;

    const snapshot = await buildLogisticsSnapshot(projectId);
    if (!snapshot) {
      return res.success({
        projectId,
        confirmedOfferVersionId: null,
        offerVersions: [],
        offers: [],
        materialOrders: [],
        workOrders: [],
        materialOrder: null,
        workOrder: null,
        invoices: [],
        events: [],
      });
    }

    return res.success({
      ...snapshot,
      offers: snapshot.offerVersions,
      acceptedOfferId: snapshot.confirmedOfferVersionId,
      materialOrder: snapshot.materialOrder,
      materialOrders: snapshot.materialOrders ?? [],
      workOrder: snapshot.workOrder,
      workOrders: snapshot.workOrders ?? [],
      invoices: [],
      events: [],
    });
  } catch (err) {
    next(err);
  }
}

export async function getInstallerAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.fail('TenantId ni podan.', 400);
    }
    const { employeeId } = req.params;
    const excludeWorkOrderId = typeof req.query.excludeWorkOrderId === 'string' ? req.query.excludeWorkOrderId : '';
    const resolvedEmployee = await resolveEmployeeIdForTenant(tenantId, employeeId);
    if ('error' in resolvedEmployee) {
      return res.fail(resolvedEmployee.error, 400);
    }
    if (!resolvedEmployee.id) {
      return res.success([]);
    }

    const nowIso = new Date().toISOString();
    const query: Record<string, unknown> = {
      assignedEmployeeIds: new Types.ObjectId(resolvedEmployee.id),
      status: { $ne: 'cancelled' },
      cancelledAt: null,
      scheduledAt: { $ne: null, $gte: nowIso },
    };
    if (excludeWorkOrderId && mongoose.isValidObjectId(excludeWorkOrderId)) {
      query._id = { $ne: new Types.ObjectId(excludeWorkOrderId) };
    }

    const workOrders = await WorkOrderModel.find(query)
      .sort({ scheduledAt: 1, createdAt: 1 })
      .limit(12)
      .lean();

    const projectIds = Array.from(new Set(workOrders.map((order) => order.projectId).filter(Boolean)));
    const projects = projectIds.length
      ? await ProjectModel.find({ id: { $in: projectIds } }).select({ id: 1, code: 1, title: 1 }).lean()
      : [];
    const projectLookup = new Map<string, any>(projects.map((project: any) => [project.id, project]));

    const availability = workOrders.map((order: any) => {
      const project = projectLookup.get(order.projectId);
      return {
        workOrderId: String(order._id),
        projectId: order.projectId,
        projectCode: project?.code ?? order.projectId,
        projectTitle: typeof project?.title === 'string' ? project.title : null,
        title: typeof order.title === 'string' ? order.title : null,
        scheduledAt: typeof order.scheduledAt === 'string' ? order.scheduledAt : null,
      };
    });

    return res.success(availability);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId } = req.params;
    const existing = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    if (!existing) {
      return res.fail('Delovni nalog ni najden.', 404);
    }
    const previousWorkOrderStatus = existing.status;

    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.fail('TenantId ni podan.', 400);
    }
    const actorEmployeeId = resolveActorEmployeeId(req);

    const payload = req.body ?? {};
    const contextRoles = getContextRoles(req);
    const isExecutionOnlyMutation = isExecutionRoleWithoutPreparationAccess(contextRoles);
    const roleCanEditPreparation = canEditPreparation(contextRoles);
    let assignedInstallerCanEditProjectPreparation = false;
    if (isExecutionOnlyMutation) {
      if (!actorEmployeeId) {
        return res.fail('Uporabnik ni povezan z monterjem.', 403);
      }
      const assignedMaterialOrderId = typeof payload.materialOrderId === 'string' ? payload.materialOrderId : null;
      const [projectAssigned, workOrderAssigned, materialOrderAssigned] = await Promise.all([
        ProjectModel.exists({ id: projectId, assignedEmployeeIds: actorEmployeeId }),
        WorkOrderModel.exists({ _id: workOrderId, projectId, assignedEmployeeIds: actorEmployeeId }),
        assignedMaterialOrderId
          ? MaterialOrderModel.exists({ _id: assignedMaterialOrderId, projectId, assignedEmployeeIds: actorEmployeeId })
          : Promise.resolve(null),
      ]);
      if (!projectAssigned && !workOrderAssigned && !materialOrderAssigned) {
        return res.fail('Ni dostopa do faze Izvedba za ta delovni nalog.', 403);
      }
      assignedInstallerCanEditProjectPreparation = true;
    }
    const canEditProjectPreparation = roleCanEditPreparation || assignedInstallerCanEditProjectPreparation;
    const isExecutionRestrictedMutation = isExecutionOnlyMutation && !canEditProjectPreparation;
    const allowCompletionAssigneeOverride = roleCanEditPreparation;
    ensureConfirmationVersionHistory(existing);
    const confirmationLocked = isConfirmationLocked(existing);
    const isCompletionStatusRequest = payload.status === 'completed' && previousWorkOrderStatus !== 'completed';
    const signatureMode = isCompletionStatusRequest
      ? (await getSettings()).workOrderCompletionSignatureMode ?? 'optional'
      : 'optional';
    if (isCompletionStatusRequest && signatureMode === 'required' && !confirmationLocked) {
      return res.fail('Zaključek delovnega naloga zahteva podpis potrdila.', 400);
    }
    const lockedConfirmationFields = ['status', 'executionNote', 'items'] as const;
    const hasLockedConfirmationMutation = confirmationLocked
      && lockedConfirmationFields.some((field) => {
        if (field === 'status' && payload.status === 'completed') {
          return false;
        }
        return field in payload;
      });
    if (hasLockedConfirmationMutation) {
      return res.fail('Potrdilo delovnega naloga je že podpisano. Potrjenih izvedbenih vrednosti ni več mogoče spreminjati.', 409);
    }
    if (
      isExecutionRestrictedMutation &&
      'status' in payload &&
      payload.status !== 'in-progress' &&
      payload.status !== 'confirmed' &&
      payload.status !== 'completed'
    ) {
      return res.fail('Ni dostopa do spremembe statusa izven faze Izvedba.', 403);
    }
    if (isExecutionRestrictedMutation && (hasPreparationOnlyWorkOrderPayload(payload) || hasPreparationOnlyMaterialPayload(payload))) {
      return res.fail('Ni dostopa do urejanja priprave. Monter lahko v fazi Izvedba shrani izvedbo in prevzem materiala.', 403);
    }
    if (hasPreparationPayload(payload) && !canEditProjectPreparation) {
      return res.fail('Ni dostopa do faze Priprava.', 403);
    }
    const resolveAssignedEmployeeIds = async (value: unknown) => {
      if (!Array.isArray(value)) {
        return { error: 'Neveljaven seznam zaposlenih.' };
      }
      const ids = value.map((entry) => String(entry)).filter((entry) => entry.length > 0);
      const invalid = ids.find((id) => !mongoose.isValidObjectId(id));
      if (invalid) {
        return { error: 'Neveljaven zaposleni.' };
      }
      if (ids.length > 0) {
        const matches = await EmployeeModel.find({ _id: { $in: ids }, tenantId }).select('_id').lean();
        if (matches.length !== ids.length) {
          return { error: 'Zaposleni ne pripadajo tenantu.' };
        }
      }
      return { ids };
    };
    const updates: Record<string, unknown> = {};

    if ('scheduledAt' in payload) {
      updates.scheduledAt = typeof payload.scheduledAt === 'string' ? payload.scheduledAt : null;
    }
    const scheduledConfirmedValue =
      'scheduledConfirmedAt' in payload ? payload.scheduledConfirmedAt : payload.scheduleConfirmedAt;
    if (scheduledConfirmedValue !== undefined) {
      if (scheduledConfirmedValue === null) {
        updates.scheduledConfirmedAt = null;
        updates.scheduledConfirmedBy = null;
      } else if (typeof scheduledConfirmedValue === 'string' && scheduledConfirmedValue.trim().length > 0) {
        updates.scheduledConfirmedAt = new Date(scheduledConfirmedValue);
        updates.scheduledConfirmedBy = resolveScheduleConfirmerLabel(req);
      }
    }
    if ('technicianName' in payload || 'technicianId' in payload) {
      console.warn('Ignoring legacy technician fields on work order update.');
    }
    if ('assignedEmployeeIds' in payload) {
      const resolved = await resolveAssignedEmployeeIds(payload.assignedEmployeeIds);
      if ('error' in resolved) {
        return res.fail(resolved.error, 400);
      }
      updates.assignedEmployeeIds = resolved.ids;
    }
    if ('mainInstallerId' in payload) {
      const resolved = await resolveEmployeeIdForTenant(tenantId, payload.mainInstallerId);
      if ('error' in resolved) {
        return res.fail(resolved.error, 400);
      }
      updates.mainInstallerId = resolved.id;
    }
    if ('location' in payload) updates.location = payload.location;
    if ('notes' in payload) updates.notes = payload.notes;
    if ('executionNote' in payload) {
      updates.executionNote =
        typeof payload.executionNote === 'string' && payload.executionNote.trim().length > 0
          ? payload.executionNote
          : payload.executionNote ?? null;
    }
    if (Array.isArray(payload.items)) {
      const currentItems =
        Array.isArray(existing.items) && existing.items.length > 0
          ? existing.items.map((item: any) => ({ ...(item.toObject ? item.toObject() : item) }))
          : [];
      const nextItems = [...currentItems];
      const resolveItemId = (incoming: any) =>
        typeof incoming.id === 'string'
          ? incoming.id
          : typeof incoming._id === 'string'
            ? incoming._id
            : null;

      payload.items.forEach((incoming: any) => {
        const targetId = resolveItemId(incoming);
        if (targetId) {
          const target = nextItems.find((item) => String(item.id) === targetId);
          if (target) {
            if (!isExecutionRestrictedMutation && typeof incoming.name === 'string') target.name = incoming.name;
            if (!isExecutionRestrictedMutation && typeof incoming.unit === 'string') target.unit = incoming.unit;
            if (!isExecutionRestrictedMutation && typeof incoming.isService === 'boolean') target.isService = incoming.isService;
            if (!isExecutionRestrictedMutation && (typeof incoming.productId === 'string' || incoming.productId === null)) {
              target.productId = incoming.productId ?? null;
            }
            if (!isExecutionRestrictedMutation && (typeof incoming.note === 'string' || incoming.note === null)) target.note = incoming.note ?? '';
            if (typeof incoming.itemNote === 'string' || incoming.itemNote === null) {
              target.itemNote = incoming.itemNote ?? null;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.plannedQuantity === 'number') {
              target.plannedQuantity = incoming.plannedQuantity;
              target.quantity = incoming.plannedQuantity;
            }
            if (typeof incoming.executedQuantity === 'number') {
              target.executedQuantity = incoming.executedQuantity;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.isExtra === 'boolean') {
              target.isExtra = incoming.isExtra;
            }
            if (typeof incoming.isCompleted === 'boolean') {
              const wasCompleted = !!target.isCompleted;
              const incomingCompletedBy = normalizeExecutionUnitEmployeeId(incoming.completedBy);
              target.isCompleted = incoming.isCompleted;
              if (incoming.isCompleted) {
                target.completedBy =
                  allowCompletionAssigneeOverride && incomingCompletedBy
                    ? incomingCompletedBy
                    : wasCompleted
                      ? normalizeExecutionUnitEmployeeId(target.completedBy) ?? incomingCompletedBy ?? actorEmployeeId
                      : actorEmployeeId ?? incomingCompletedBy ?? normalizeExecutionUnitEmployeeId(target.completedBy);
                target.completedAt =
                  (wasCompleted ? normalizeCompletedAt(target.completedAt) : null) ??
                  normalizeCompletedAt(incoming.completedAt) ??
                  new Date();
              } else {
                target.completedBy = null;
                target.completedAt = null;
              }
            }
            if (!isExecutionRestrictedMutation && typeof incoming.casovnaNorma === 'number' && Number.isFinite(incoming.casovnaNorma)) {
              target.casovnaNorma = incoming.casovnaNorma;
            }
            if (!isExecutionRestrictedMutation && (typeof incoming.offerItemId === 'string' || incoming.offerItemId === null)) {
              target.offerItemId = incoming.offerItemId ?? null;
            }
            if ('timeTracking' in incoming) {
              target.timeTracking = normalizeWorkOrderTimeTracking(incoming.timeTracking, actorEmployeeId);
            }
            if ('executionSpec' in incoming) {
              target.executionSpec = sanitizeIncomingExecutionSpec(
                incoming.executionSpec,
                target.executionSpec,
                actorEmployeeId,
                allowCompletionAssigneeOverride,
              );
            }
            return;
          }
        }
        const planned = typeof incoming.plannedQuantity === 'number' ? incoming.plannedQuantity : 0;
        const executed = typeof incoming.executedQuantity === 'number' ? incoming.executedQuantity : planned;
        const offered = typeof incoming.offeredQuantity === 'number' ? incoming.offeredQuantity : 0;
        if (isExecutionRestrictedMutation && incoming.isExtra === false) {
          return;
        }
        const newItemId =
          typeof incoming.id === 'string'
            ? incoming.id
            : typeof incoming._id === 'string'
              ? incoming._id
              : `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        nextItems.push({
          id: newItemId,
          productId: incoming.productId ?? null,
          name: incoming.name ?? 'Dodatna postavka',
          quantity: planned,
          unit: incoming.unit ?? '',
          isService: typeof incoming.isService === 'boolean' ? incoming.isService : false,
          note: incoming.note ?? '',
          offerItemId: incoming.offerItemId ?? null,
          offeredQuantity: offered,
          plannedQuantity: planned,
          executedQuantity: executed,
          isExtra: incoming.isExtra !== undefined ? !!incoming.isExtra : true,
          itemNote: typeof incoming.itemNote === 'string' ? incoming.itemNote : null,
          isCompleted: typeof incoming.isCompleted === 'boolean' ? incoming.isCompleted : false,
          completedBy:
            incoming.isCompleted === true
              ? allowCompletionAssigneeOverride
                ? normalizeExecutionUnitEmployeeId(incoming.completedBy) ?? actorEmployeeId
                : actorEmployeeId ?? normalizeExecutionUnitEmployeeId(incoming.completedBy)
              : null,
          completedAt:
            incoming.isCompleted === true
              ? normalizeCompletedAt(incoming.completedAt) ?? new Date()
              : null,
          casovnaNorma:
            typeof incoming.casovnaNorma === 'number' && Number.isFinite(incoming.casovnaNorma)
              ? incoming.casovnaNorma
              : 0,
          timeTracking: normalizeWorkOrderTimeTracking(incoming.timeTracking, actorEmployeeId),
          executionSpec: sanitizeIncomingExecutionSpec(
            incoming.executionSpec,
            null,
            actorEmployeeId,
            allowCompletionAssigneeOverride,
          ),
        });
      });

      const productServiceFlags = await buildProductServiceFlagMap(nextItems.map((item: any) => item.productId ?? null));
      updates.items = normalizeWorkOrderItemsWithProductTruth(nextItems, productServiceFlags).normalizedItems;
    }
      if (Array.isArray(payload.workLogs)) {
        updates.workLogs = payload.workLogs
          .filter((log: any) => typeof log.employeeId === 'string' && log.employeeId.trim().length > 0)
          .map((log: any) => ({
            employeeId: String(log.employeeId),
            hours: typeof log.hours === 'number' && Number.isFinite(log.hours) ? log.hours : 0,
          }));
      }

    if (
      payload.status === 'draft' ||
      payload.status === 'issued' ||
      payload.status === 'in-progress' ||
      payload.status === 'confirmed' ||
      payload.status === 'completed'
    ) {
      updates.status = payload.status;
      if (payload.status === 'completed' && previousWorkOrderStatus !== 'completed') {
        updates.completedAt = new Date();
      } else if (payload.status !== 'completed') {
        updates.completedAt = null;
      }
    }

  const updated = await WorkOrderModel.findOneAndUpdate({ _id: workOrderId, projectId }, { $set: updates }, { new: true });
  const [normalizedUpdated] = await normalizeAndPersistWorkOrdersServiceFlags(updated ? [updated] : []);

  const materialOrderId = typeof payload.materialOrderId === 'string' ? payload.materialOrderId : null;
  if (materialOrderId) {
    const materialUpdates: Record<string, unknown> = {};
    if (
      typeof payload.materialStatus === 'string' &&
      MATERIAL_STATUS_VALUES.includes(payload.materialStatus) &&
      (!isExecutionRestrictedMutation || isExecutionMaterialStatus(payload.materialStatus))
    ) {
      materialUpdates.materialStatus = payload.materialStatus;
    }
    if ('materialAssignedEmployeeIds' in payload) {
      const resolved = await resolveAssignedEmployeeIds(payload.materialAssignedEmployeeIds);
      if ('error' in resolved) {
        return res.fail(resolved.error, 400);
      }
      materialUpdates.assignedEmployeeIds = resolved.ids;
    }
    if ('pickupMethod' in payload) {
      materialUpdates.pickupMethod =
        typeof payload.pickupMethod === 'string' && MATERIAL_PICKUP_METHOD_VALUES.includes(payload.pickupMethod as MaterialPickupMethod)
          ? payload.pickupMethod
          : null;
    }
    if ('pickupLocation' in payload) {
      materialUpdates.pickupLocation = typeof payload.pickupLocation === 'string' ? payload.pickupLocation : null;
    }
    if ('pickupNote' in payload) {
      materialUpdates.pickupNote = typeof payload.pickupNote === 'string' ? payload.pickupNote : null;
    }
    if ('expectedAt' in payload) {
      const expectedAt = parseOptionalDate(payload.expectedAt);
      if (expectedAt !== undefined) {
        materialUpdates.expectedAt = expectedAt;
      }
    }
    if ('logisticsOwnerId' in payload) {
      const nextOwner = typeof payload.logisticsOwnerId === 'string' ? payload.logisticsOwnerId.trim() : '';
      if (!nextOwner) {
        materialUpdates.logisticsOwnerId = null;
      } else {
        const resolved = await resolveAssignedEmployeeIds([nextOwner]);
        if ('error' in resolved) {
          return res.fail(resolved.error, 400);
        }
        materialUpdates.logisticsOwnerId = resolved.ids[0] ?? null;
      }
    }
    if ('pickupConfirmedAt' in payload) {
      if (payload.pickupConfirmedAt === null) {
        materialUpdates.pickupConfirmedAt = null;
        materialUpdates.pickupConfirmedBy = null;
      } else if (typeof payload.pickupConfirmedAt === 'string' && payload.pickupConfirmedAt.trim().length > 0) {
        materialUpdates.pickupConfirmedAt = new Date(payload.pickupConfirmedAt);
        materialUpdates.pickupConfirmedBy = resolveActorId(req);
        if (!('materialStatus' in materialUpdates)) {
          materialUpdates.materialStatus = 'Prevzeto';
        }
      }
    }
    if ('materialTechnicianId' in payload || 'materialTechnicianName' in payload) {
      console.warn('Ignoring legacy material technician fields on work order update.');
    }

    if (Object.keys(materialUpdates).length > 0) {
      materialUpdates.workOrderId = workOrderId;
      await MaterialOrderModel.findOneAndUpdate(
        { _id: materialOrderId, projectId },
        { $set: materialUpdates },
        { new: false }
      );
    }
  }

  if (Array.isArray(payload.materialItems)) {
    const materialOrder = await MaterialOrderModel.findOne({ _id: materialOrderId, projectId });
    if (materialOrder) {
      const currentItems = Array.isArray(materialOrder.items)
        ? materialOrder.items.map((item: any) => ({ ...(item.toObject ? item.toObject() : item) }))
        : [];
      const nextItems = [...currentItems];
      const changes: Array<{ itemId: string; before: number; after: number }> = [];
      let hasItemMutations = false;
      const resolveItemId = (incoming: any) =>
        typeof incoming.id === 'string'
          ? incoming.id
          : typeof incoming._id === 'string'
            ? incoming._id
            : null;

      (payload.materialItems as Array<any>).forEach((incoming: any) => {
        const targetId = resolveItemId(incoming);
        if (targetId) {
          const target = nextItems.find((item) => String(item.id) === targetId);
          if (target) {
            if (!isExecutionRestrictedMutation && typeof incoming.name === 'string' && target.name !== incoming.name) {
              target.name = incoming.name;
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.unit === 'string' && target.unit !== incoming.unit) {
              target.unit = incoming.unit;
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && (typeof incoming.note === 'string' || incoming.note === null)) {
              const nextNote = incoming.note ?? '';
              if (target.note !== nextNote) {
                target.note = nextNote;
                hasItemMutations = true;
              }
            }
            if (!isExecutionRestrictedMutation && (typeof incoming.productId === 'string' || incoming.productId === null)) {
              const nextProductId = incoming.productId ?? null;
              if (target.productId !== nextProductId) {
                target.productId = nextProductId;
                hasItemMutations = true;
              }
            }
            if (!isExecutionRestrictedMutation && typeof incoming.quantity === 'number' && Number.isFinite(incoming.quantity) && target.quantity !== incoming.quantity) {
              target.quantity = incoming.quantity;
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.isOrdered === 'boolean' && target.isOrdered !== incoming.isOrdered) {
              target.isOrdered = incoming.isOrdered;
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.orderedQty === 'number' && Number.isFinite(incoming.orderedQty)) {
              const nextOrderedQty = Math.max(0, incoming.orderedQty);
              if (target.orderedQty !== nextOrderedQty) {
                target.orderedQty = nextOrderedQty;
                hasItemMutations = true;
              }
            }
            if (typeof incoming.deliveredQty === 'number' && Number.isFinite(incoming.deliveredQty)) {
              const before = typeof target.deliveredQty === 'number' ? target.deliveredQty : 0;
              const after = Math.max(0, incoming.deliveredQty);
              target.deliveredQty = after;
              if (before !== after) {
                changes.push({ itemId: String(targetId), before, after });
              }
            }
            if (
              typeof incoming.materialStep === 'string' &&
              (!isExecutionRestrictedMutation || isExecutionMaterialStep(incoming.materialStep)) &&
              target.materialStep !== incoming.materialStep
            ) {
              target.materialStep = incoming.materialStep;
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.dobavitelj === 'string' && target.dobavitelj !== incoming.dobavitelj) {
              target.dobavitelj = incoming.dobavitelj;
              target.supplierKey = normalizeSupplierKey(target.dobavitelj, target.naslovDobavitelja);
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.naslovDobavitelja === 'string' && target.naslovDobavitelja !== incoming.naslovDobavitelja) {
              target.naslovDobavitelja = incoming.naslovDobavitelja;
              target.supplierKey = normalizeSupplierKey(target.dobavitelj, target.naslovDobavitelja);
              hasItemMutations = true;
            }
            if (!isExecutionRestrictedMutation && typeof incoming.isExtra === 'boolean' && target.isExtra !== incoming.isExtra) {
              target.isExtra = incoming.isExtra;
              hasItemMutations = true;
            }
            return;
          }
        }
        if (isExecutionRestrictedMutation) {
          return;
        }

        const deliveredQty = typeof incoming.deliveredQty === 'number' && Number.isFinite(incoming.deliveredQty)
          ? Math.max(0, incoming.deliveredQty)
          : typeof incoming.quantity === 'number' && Number.isFinite(incoming.quantity)
            ? Math.max(0, incoming.quantity)
            : 0;
        const orderedQty = typeof incoming.orderedQty === 'number' && Number.isFinite(incoming.orderedQty)
          ? Math.max(0, incoming.orderedQty)
          : 0;
        const quantity = typeof incoming.quantity === 'number' && Number.isFinite(incoming.quantity)
          ? incoming.quantity
          : 0;
        const newItemId =
          typeof incoming.id === 'string'
            ? incoming.id
            : typeof incoming._id === 'string'
              ? incoming._id
              : `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        nextItems.push({
          id: newItemId,
          productId: typeof incoming.productId === 'string' ? incoming.productId : null,
          name: typeof incoming.name === 'string' && incoming.name.trim().length > 0 ? incoming.name : 'Dodatni material',
          quantity,
          isOrdered: typeof incoming.isOrdered === 'boolean' ? incoming.isOrdered : false,
          orderedQty,
          deliveredQty,
          unit: typeof incoming.unit === 'string' ? incoming.unit : '',
          note: typeof incoming.note === 'string' ? incoming.note : '',
          dobavitelj: typeof incoming.dobavitelj === 'string' ? incoming.dobavitelj : '',
          naslovDobavitelja: typeof incoming.naslovDobavitelja === 'string' ? incoming.naslovDobavitelja : '',
          supplierKey: normalizeSupplierKey(incoming.dobavitelj, incoming.naslovDobavitelja),
          materialStep: typeof incoming.materialStep === 'string' ? incoming.materialStep : 'Prevzeto',
          isExtra: incoming.isExtra !== undefined ? Boolean(incoming.isExtra) : true,
        });
        hasItemMutations = true;
        if (deliveredQty > 0) {
          changes.push({ itemId: newItemId, before: 0, after: deliveredQty });
        }
      });

      if (hasItemMutations || changes.length > 0 || nextItems.length !== currentItems.length) {
        materialOrder.items = nextItems;
        await materialOrder.save();

        if (changes.length > 0) {
          const project = await ProjectModel.findOne({ id: projectId });
          if (project) {
            const actorEmployeeId = resolveActorId(req);
            changes.forEach((change) => {
              addTimeline(project, {
                type: 'edit',
                title: 'MATERIAL_DELIVERED_QTY_UPDATED',
                description: 'Material delivered quantity updated.',
                timestamp: new Date().toISOString(),
                user: 'system',
                metadata: {
                  actorEmployeeId: actorEmployeeId ?? '',
                  projectId,
                  materialOrderId,
                  itemId: change.itemId,
                  before: String(change.before),
                  after: String(change.after),
                },
              });
            });
            await project.save();
          }
        }
      }
    }
  }

  const nextWorkOrderStatus = String((normalizedUpdated ?? updated)?.status ?? '');
  let shouldRefreshResponseOrder = false;
  if (previousWorkOrderStatus !== 'issued' && nextWorkOrderStatus === 'issued') {
    await moveProjectToExecution({ projectId, workOrderId, req, mode: 'manual' });
  } else {
    shouldRefreshResponseOrder = await applyAutomaticPreparationProgression(projectId, workOrderId, req);
  }

  if (previousWorkOrderStatus !== 'completed' && nextWorkOrderStatus === 'completed') {
    await createInvoiceFromClosing(projectId);
    const project = await ProjectModel.findOne({ id: projectId });
    if (project) {
      addTimeline(project, {
        type: 'execution',
        title: 'Delovni nalog zaključen',
        description: 'Pripravljen je osnutek računa. Račun še ni izstavljen.',
        timestamp: new Date().toISOString(),
        user: buildActorDisplayName(req as any),
        metadata: {
          workOrderId,
          actorEmployeeId: resolveActorEmployeeId(req) ?? '',
        },
      });
      await project.save();
    }
  }

  if (normalizedUpdated && Array.isArray(payload.items)) {
    await syncProjectExecutionDefinitionsFromWorkOrder(projectId, normalizedUpdated);
  }

  const responseOrder = shouldRefreshResponseOrder
    ? await WorkOrderModel.findOne({ _id: workOrderId, projectId }).lean()
    : normalizedUpdated ?? updated;
  return res.success(serializeWorkOrder(responseOrder));
  } catch (err) {
    next(err);
  }
}

export async function startWorkOrderConfirmationCorrection(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId } = req.params;
    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    ensureConfirmationVersionHistory(workOrder);
    const activeConfirmationVersion = getActiveSignedConfirmationVersion(workOrder);
    if (!activeConfirmationVersion) {
      return res.fail('Aktivno podpisano potrdilo delovnega naloga ni na voljo.', 409);
    }

    workOrder.confirmationVersions = (workOrder.confirmationVersions ?? []).map((version) => ({
      ...version,
      state: version.id === activeConfirmationVersion.id ? 'archived' : version.state === 'active' ? 'superseded' : version.state,
    }));
    workOrder.confirmationActiveVersionId = null;
    workOrder.confirmationState = 'resign_required';
    workOrder.customerSignerName = null;
    workOrder.customerSignature = null;
    workOrder.customerSignedAt = null;
    workOrder.customerRemark = null;
    workOrder.markModified('confirmationVersions');
    await workOrder.save();

    const project = await ProjectModel.findOne({ id: projectId });
    if (project) {
      addTimeline(project, {
        type: 'execution',
        title: 'Popravek potrdila delovnega naloga',
        description: `Aktivna verzija V${activeConfirmationVersion.versionNumber} je arhivirana. Zahtevan je nov podpis stranke.`,
        timestamp: new Date().toLocaleString('sl-SI'),
        user: buildActorDisplayName(req as any),
        metadata: {
          workOrderId,
          archivedVersionId: activeConfirmationVersion.id,
          archivedVersionNumber: String(activeConfirmationVersion.versionNumber),
        },
      });
      await project.save();
    }

    const refreshed = await WorkOrderModel.findOne({ _id: workOrderId, projectId }).lean();
    const [normalizedRefreshed] = await normalizeAndPersistWorkOrdersServiceFlags(refreshed ? [refreshed] : []);
    return res.success(serializeWorkOrder(normalizedRefreshed ?? refreshed));
  } catch (err) {
    next(err);
  }
}

function parseMaterialDocType(value?: string | string[] | null): 'PURCHASE_ORDER' | 'DELIVERY_NOTE' {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized === 'string' && normalized.toUpperCase() === 'DELIVERY_NOTE') {
    return 'DELIVERY_NOTE';
  }
  return 'PURCHASE_ORDER';
}

function parseWorkDocType(value?: string | string[] | null): 'WORK_ORDER' | 'WORK_ORDER_CONFIRMATION' {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized === 'string' && normalized.toUpperCase() === 'WORK_ORDER_CONFIRMATION') {
    return 'WORK_ORDER_CONFIRMATION';
  }
  return 'WORK_ORDER';
}

function parsePdfResponseMode(value?: string | string[] | null): 'inline' | 'download' {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized === 'string' && normalized.toLowerCase() === 'inline') {
    return 'inline';
  }
  return 'download';
}

export async function advanceMaterialOrderStep(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, materialOrderId } = req.params;
    const materialOrder = await MaterialOrderModel.findOne({
      _id: materialOrderId,
      projectId,
      status: { $ne: 'cancelled' },
    });
    if (!materialOrder) {
      return res.fail('Naročilo materiala ni najdeno.', 404);
    }

    const items = (materialOrder.items ?? []).map((item: any) => ({
      ...(item.toObject ? item.toObject() : item),
      materialStep: resolveMaterialStep(item.materialStep),
    }));

    if (items.length === 0) {
      return res.success({ materialOrders: [serializeMaterialOrder(materialOrder)].filter(Boolean) });
    }

    const targetStepInput =
      typeof req.body?.targetStep === 'string' ? (req.body.targetStep as string).trim() : null;

    const minStepIndex = items.reduce((min, item) => {
      const index = MATERIAL_STEP_SEQUENCE.indexOf(resolveMaterialStep(item.materialStep));
      return Math.min(min, index >= 0 ? index : 0);
    }, MATERIAL_STEP_SEQUENCE.length - 1);
    const currentStep = MATERIAL_STEP_SEQUENCE[minStepIndex] ?? MATERIAL_STEP_SEQUENCE[0];
    const expectedNext = getNextStep(currentStep);
    if (!expectedNext) {
      return res.success({ materialOrders: [serializeMaterialOrder(materialOrder)].filter(Boolean) });
    }
    if (targetStepInput && targetStepInput !== expectedNext) {
      return res.fail('Neveljaven korak napredovanja.', 400);
    }

    const targetStep = expectedNext;
    const targetIndex = MATERIAL_STEP_SEQUENCE.indexOf(targetStep);

    const advancedItems = items.map((item) => {
      const current = resolveMaterialStep(item.materialStep);
      if (current === currentStep && isStepEligible(item, targetStep)) {
        return { ...item, materialStep: targetStep };
      }
      return item;
    });

    const groups = new Map<string, any[]>();
    advancedItems.forEach((item) => {
      const key = resolveSupplierKey(item);
      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    });

    const groupEntries = Array.from(groups.entries());
    const primaryKey = groupEntries[0]?.[0] ?? 'brez-dobavitelja';

    const createOrderFromItems = async (itemsForOrder: any[]) => {
      const stepIndex = itemsForOrder.reduce((min, item) => {
        const index = MATERIAL_STEP_SEQUENCE.indexOf(resolveMaterialStep(item.materialStep));
        return Math.min(min, index >= 0 ? index : 0);
      }, MATERIAL_STEP_SEQUENCE.length - 1);
      const step = MATERIAL_STEP_SEQUENCE[stepIndex] ?? MATERIAL_STEP_SEQUENCE[0];
      const materialStatus = MATERIAL_STATUS_BY_STEP[step];
      return MaterialOrderModel.create({
        projectId,
        offerVersionId: materialOrder.offerVersionId,
        workOrderId: materialOrder.workOrderId,
        items: itemsForOrder,
        status: materialOrder.status ?? 'draft',
        materialStatus,
        assignedEmployeeIds: materialOrder.assignedEmployeeIds ?? [],
        pickupMethod: materialOrder.pickupMethod ?? 'SUPPLIER_PICKUP',
        pickupLocation: materialOrder.pickupLocation ?? null,
        logisticsOwnerId: materialOrder.logisticsOwnerId ?? null,
        pickupNote: materialOrder.pickupNote ?? null,
        expectedAt: materialOrder.expectedAt ?? null,
        pickupConfirmedAt: materialOrder.pickupConfirmedAt ?? null,
        pickupConfirmedBy: materialOrder.pickupConfirmedBy ?? null,
        reopened: false,
      });
    };

    const createdOrders: any[] = [];

    for (const [supplierKey, groupItems] of groupEntries) {
      const mainItems = groupItems.filter(
        (item) => MATERIAL_STEP_SEQUENCE.indexOf(resolveMaterialStep(item.materialStep)) >= targetIndex
      );
      const laggingItems = groupItems.filter(
        (item) => MATERIAL_STEP_SEQUENCE.indexOf(resolveMaterialStep(item.materialStep)) < targetIndex
      );

      const shouldSplit = mainItems.length > 0 && laggingItems.length > 0;
      const primaryItems = mainItems.length > 0 ? mainItems : groupItems;

      if (supplierKey === primaryKey) {
        materialOrder.items = primaryItems;
        const stepIndex = primaryItems.reduce((min, item) => {
          const index = MATERIAL_STEP_SEQUENCE.indexOf(resolveMaterialStep(item.materialStep));
          return Math.min(min, index >= 0 ? index : 0);
        }, MATERIAL_STEP_SEQUENCE.length - 1);
        const step = MATERIAL_STEP_SEQUENCE[stepIndex] ?? MATERIAL_STEP_SEQUENCE[0];
        materialOrder.materialStatus = MATERIAL_STATUS_BY_STEP[step];
        await materialOrder.save();
      } else {
        const created = await createOrderFromItems(primaryItems);
        createdOrders.push(created);
      }

      if (shouldSplit) {
        const laggingOrder = await createOrderFromItems(laggingItems);
        createdOrders.push(laggingOrder);
      }
    }

    const materialOrderDocs = await MaterialOrderModel.find({
      projectId,
      status: { $ne: 'cancelled' },
      cancelledAt: null,
    }).sort({ createdAt: 1 });

    // Merge lagging orders back once all items for the same supplier align on the same step.
    const mergeGroups = new Map<string, typeof materialOrderDocs>();
    for (const order of materialOrderDocs) {
      const items = (order.items ?? []).map((item: any) => ({
        ...(item.toObject ? item.toObject() : item),
      }));
      if (items.length === 0) continue;
      const supplierKey = resolveSupplierKey(items[0]);
      const hasMixedSuppliers = items.some((item) => resolveSupplierKey(item) !== supplierKey);
      if (hasMixedSuppliers) continue;
      const workOrderId = order.workOrderId ? String(order.workOrderId) : '';
      const groupKey = `${order.offerVersionId}::${supplierKey}::${workOrderId}`;
      const existing = mergeGroups.get(groupKey);
      if (existing) {
        existing.push(order);
      } else {
        mergeGroups.set(groupKey, [order]);
      }
    }

    for (const orders of mergeGroups.values()) {
      if (orders.length <= 1) continue;
      const stepIndexes = orders.flatMap((order) =>
        (order.items ?? []).map((item: any) => MATERIAL_STEP_SEQUENCE.indexOf(resolveMaterialStep(item.materialStep)))
      );
      if (stepIndexes.length === 0) continue;
      const minIndex = Math.min(...stepIndexes);
      const maxIndex = Math.max(...stepIndexes);
      if (minIndex !== maxIndex) continue;

      const primary = orders[0];
      const mergedItems = orders.flatMap((order) =>
        (order.items ?? []).map((item: any) => (item.toObject ? item.toObject() : item))
      );
      const step = MATERIAL_STEP_SEQUENCE[minIndex] ?? MATERIAL_STEP_SEQUENCE[0];
      primary.items = mergedItems;
      primary.materialStatus = MATERIAL_STATUS_BY_STEP[step];
      await primary.save();

      const toRemove = orders.slice(1).map((order) => order._id);
      if (toRemove.length > 0) {
        await MaterialOrderModel.deleteMany({ _id: { $in: toRemove } });
      }
    }

    const refreshedMaterialOrders = await MaterialOrderModel.find({
      projectId,
      status: { $ne: 'cancelled' },
      cancelledAt: null,
    })
      .sort({ createdAt: 1 })
      .lean();

    const serializedMaterialOrders = refreshedMaterialOrders
      .map(serializeMaterialOrder)
      .filter((order): order is MaterialOrder => order !== null);

    const workOrderIds = Array.from(
      new Set<string>(
        refreshedMaterialOrders
          .map((order: any) => (order.workOrderId ? String(order.workOrderId) : ''))
          .filter(Boolean)
      )
    );
    for (const relatedWorkOrderId of workOrderIds) {
      await applyAutomaticPreparationProgression(projectId, relatedWorkOrderId, req);
    }

    return res.success({ materialOrders: serializedMaterialOrders });
  } catch (err) {
    next(err);
  }
}

export async function exportMaterialOrderPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const docType = parseMaterialDocType(req.query.docType);
    const mode = parsePdfResponseMode(req.query.mode);
    const buffer = await generateMaterialOrderDocumentPdf(req.params.projectId, req.params.materialOrderId, docType);
    res.setHeader('Content-Type', 'application/pdf');
    const slug = docType === 'DELIVERY_NOTE' ? 'delivery-note' : 'purchase-order';
    res.setHeader('Content-Disposition', `${mode}; filename="${slug}-${req.params.materialOrderId}.pdf"`);
    res.end(buffer);
  } catch (error) {
    next(error);
  }
}

export async function exportWorkOrderPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const docType = parseWorkDocType(req.query.docType);
    const mode = parsePdfResponseMode(req.query.mode);
    const confirmationVersionId =
      typeof req.query.confirmationVersionId === 'string' && req.query.confirmationVersionId.trim().length > 0
        ? req.query.confirmationVersionId.trim()
        : null;
    const buffer = await generateWorkOrderDocumentPdf(
      req.params.projectId,
      req.params.workOrderId,
      docType,
      confirmationVersionId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    const slug = docType === 'WORK_ORDER_CONFIRMATION' ? 'work-order-confirmation' : 'work-order';
    res.setHeader('Content-Disposition', `${mode}; filename="${slug}-${req.params.workOrderId}.pdf"`);
    res.end(buffer);
  } catch (error) {
    next(error);
  }
}

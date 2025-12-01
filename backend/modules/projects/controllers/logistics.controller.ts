import { NextFunction, Request, Response } from 'express';
import type { ProjectLogisticsSnapshot } from '../../../../shared/types/logistics';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel } from '../schemas/project';
import { MaterialOrderModel } from '../schemas/material-order';
import { WorkOrderModel } from '../schemas/work-order';
import type { OfferLineItem } from '../../../../shared/types/offers';

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

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function mapOfferItemsToLogistics(items: OfferLineItem[]) {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId ?? null,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
}

function serializeMaterialOrder(order: any) {
  if (!order) return null;
  return {
    _id: String(order._id),
    projectId: order.projectId,
    offerVersionId: order.offerVersionId,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note: item.note,
    })),
    status: order.status,
    createdAt: serializeDate(order.createdAt) ?? '',
    updatedAt: serializeDate(order.updatedAt) ?? '',
  };
}

function serializeWorkOrder(order: any) {
  if (!order) return null;
  return {
    _id: String(order._id),
    projectId: order.projectId,
    offerVersionId: order.offerVersionId,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note: item.note,
    })),
    status: order.status,
    scheduledAt: serializeDate(order.scheduledAt),
    technicianName: order.technicianName,
    technicianId: order.technicianId,
    location: order.location,
    notes: order.notes,
    createdAt: serializeDate(order.createdAt) ?? '',
    updatedAt: serializeDate(order.updatedAt) ?? '',
  };
}

async function buildLogisticsSnapshot(projectId: string): Promise<ProjectLogisticsSnapshot | null> {
  const project = await ProjectModel.findOne({ id: projectId }).lean();
  if (!project) return null;

  const offerVersions = await OfferVersionModel.find({ projectId }).sort({ versionNumber: 1 }).lean();
  const confirmedOfferVersionId = project.confirmedOfferVersionId ?? null;

  const materialOrder = confirmedOfferVersionId
    ? await MaterialOrderModel.findOne({ projectId, offerVersionId: confirmedOfferVersionId }).lean()
    : await MaterialOrderModel.findOne({ projectId }).sort({ updatedAt: -1 }).lean();

  const workOrder = confirmedOfferVersionId
    ? await WorkOrderModel.findOne({ projectId, offerVersionId: confirmedOfferVersionId }).lean()
    : await WorkOrderModel.findOne({ projectId }).sort({ updatedAt: -1 }).lean();

  return {
    projectId,
    confirmedOfferVersionId,
    offerVersions: offerVersions.map((offer) => ({
      _id: String(offer._id),
      title: offer.title,
      versionNumber: offer.versionNumber,
      status: offer.status,
      totalWithVat: offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0,
    })),
    materialOrder: serializeMaterialOrder(materialOrder),
    workOrder: serializeWorkOrder(workOrder),
  };
}

export async function confirmOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, offerId } = req.params;
    const offer = await OfferVersionModel.findOne({ _id: offerId, projectId });

    if (!offer) {
      return res.fail('Ponudba ni najdena.', 404);
    }

    offer.status = 'accepted';
    await offer.save();

    await ProjectModel.findOneAndUpdate(
      { id: projectId },
      { confirmedOfferVersionId: offerId },
      { new: true }
    );

    const logisticsItems = mapOfferItemsToLogistics(offer.items || []);

    await MaterialOrderModel.findOneAndUpdate(
      { projectId, offerVersionId: offerId },
      { $set: { items: logisticsItems, projectId, offerVersionId: offerId }, $setOnInsert: { status: 'draft' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await WorkOrderModel.findOneAndUpdate(
      { projectId, offerVersionId: offerId },
      {
        $set: { items: logisticsItems, projectId, offerVersionId: offerId },
        $setOnInsert: { status: 'draft', scheduledAt: null },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const snapshot = await buildLogisticsSnapshot(projectId);
    return res.success(snapshot);
  } catch (err) {
    next(err);
  }
}

export async function getProjectLogistics(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;

    const project = await ProjectModel.findOne({ id: projectId }).lean();

    const offers = await OfferVersionModel.find({ projectId }).sort({ createdAt: 1 }).lean();
    const offerRows = offers.map((offer) => {
      const totals = calculateOfferTotalsFromSnapshot({
        items: offer.items || [],
        usePerItemDiscount: offer.usePerItemDiscount ?? false,
        useGlobalDiscount: offer.useGlobalDiscount ?? true,
        globalDiscountPercent: offer.globalDiscountPercent ?? offer.discountPercent ?? 0,
        vatMode: offer.vatMode ?? 22,
      });

      return {
        _id: String(offer._id),
        title: offer.title || offer.baseTitle || 'Ponudba',
        versionNumber: offer.versionNumber ?? 0,
        status: offer.status ?? 'draft',
        totalWithVat: totals.totalWithVat ?? offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0,
        createdAt: offer.createdAt ? new Date(offer.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    return res.success({
      projectId,
      confirmedOfferVersionId: project?.confirmedOfferVersionId ?? null,

      // Verzije ponudb (LogisticsTab jih prikazuje)
      offerVersions: offerRows,
      offers: offerRows,

      // Potrjena verzija ponudbe (združeno z confirmedOfferVersionId)
      acceptedOfferId: project?.confirmedOfferVersionId ?? null,

      // Naročilnice / Delovni nalogi / Računi / dogodki
      materialOrder: null,
      workOrder: null,
      invoices: [],
      events: [],
    });
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

    const payload = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if ('scheduledAt' in payload) {
      updates.scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    }
    if ('technicianName' in payload) updates.technicianName = payload.technicianName;
    if ('technicianId' in payload) updates.technicianId = payload.technicianId;
    if ('location' in payload) updates.location = payload.location;
    if ('notes' in payload) updates.notes = payload.notes;
    if (
      payload.status === 'draft' ||
      payload.status === 'scheduled' ||
      payload.status === 'in_progress' ||
      payload.status === 'completed' ||
      payload.status === 'cancelled'
    ) {
      updates.status = payload.status;
    }

    const updated = await WorkOrderModel.findOneAndUpdate({ _id: workOrderId, projectId }, { $set: updates }, { new: true });
    return res.success(serializeWorkOrder(updated));
  } catch (err) {
    next(err);
  }
}

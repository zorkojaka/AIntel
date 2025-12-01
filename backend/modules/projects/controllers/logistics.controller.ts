import { NextFunction, Request, Response } from 'express';
import type { ProjectLogisticsSnapshot } from '../../../../shared/types/logistics';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel } from '../schemas/project';
import { MaterialOrderModel } from '../schemas/material-order';
import { WorkOrderModel } from '../schemas/work-order';
import type { OfferLineItem } from '../../../../shared/types/offers';

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
    const snapshot = await buildLogisticsSnapshot(projectId);
    if (!snapshot) {
      return res.fail('Projekt ni najden.', 404);
    }
    return res.success(snapshot);
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

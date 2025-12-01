import { NextFunction, Request, Response } from 'express';
import type { ProjectLogisticsSnapshot } from '../../../../shared/types/logistics';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel, addTimeline } from '../schemas/project';
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
    cancelledAt: serializeDate(order.cancelledAt),
    reopened: !!order.reopened,
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
    customerName: order.customerName ?? '',
    customerEmail: order.customerEmail ?? '',
    customerPhone: order.customerPhone ?? '',
    customerAddress: order.customerAddress ?? '',
    cancelledAt: serializeDate(order.cancelledAt),
    reopened: !!order.reopened,
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
    materialOrder: serializeMaterialOrder(materialOrder),
    workOrder: serializeWorkOrder(workOrder),
  };
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

    const previousStatus = offer.status;
    offer.status = 'accepted';
    await offer.save();

    const updatedProject = await ProjectModel.findOneAndUpdate(
      { id: projectId },
      { confirmedOfferVersionId: offerId },
      { new: true }
    );

    const logisticsItems = mapOfferItemsToLogistics(offer.items || []);
    const customerName = project.customer?.name ?? '';
    const customerEmail = (project as any).customer?.email ?? '';
    const customerPhone = (project as any).customer?.phone ?? '';
    const customerAddress = project.customer?.address ?? '';

    const materialOrder = await MaterialOrderModel.findOne({ projectId, offerVersionId: offerId });
    if (materialOrder) {
      const wasCancelled = materialOrder.status === 'cancelled';
      materialOrder.items = logisticsItems;
      materialOrder.status = wasCancelled ? 'draft' : materialOrder.status;
      materialOrder.cancelledAt = null;
      materialOrder.reopened = wasCancelled;
      await materialOrder.save();
    } else {
      await MaterialOrderModel.create({
        projectId,
        offerVersionId: offerId,
        items: logisticsItems,
        status: 'draft',
        reopened: false,
      });
    }

    const workOrder = await WorkOrderModel.findOne({ projectId, offerVersionId: offerId });
    if (workOrder) {
      const wasCancelled = workOrder.status === 'cancelled';
      workOrder.items = logisticsItems;
      workOrder.status = wasCancelled ? 'draft' : workOrder.status;
      workOrder.cancelledAt = null;
      workOrder.reopened = wasCancelled;
      workOrder.customerName = customerName;
      workOrder.customerEmail = customerEmail;
      workOrder.customerPhone = customerPhone;
      workOrder.customerAddress = customerAddress;
      await workOrder.save();
    } else {
      await WorkOrderModel.create({
        projectId,
        offerVersionId: offerId,
        items: logisticsItems,
        status: 'draft',
        reopened: false,
        scheduledAt: null,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
      });
    }

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

    const snapshot = await buildLogisticsSnapshot(projectId);
    return res.success(snapshot);
  } catch (err) {
    next(err);
  }
}

export async function cancelOfferConfirmation(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;

    const project = await ProjectModel.findOne({ id: projectId });
    if (!project || !project.confirmedOfferVersionId) {
      return res.fail('Ni potrjene ponudbe za preklic.', 400);
    }

    const confirmedOfferVersionId = project.confirmedOfferVersionId;
    project.confirmedOfferVersionId = null;
    await project.save();

    const offer = await OfferVersionModel.findOneAndUpdate(
      { _id: confirmedOfferVersionId, projectId },
      { status: 'cancelled' },
      { new: true }
    );

    const now = new Date();

    await MaterialOrderModel.findOneAndUpdate(
      { projectId, offerVersionId: confirmedOfferVersionId },
      { status: 'cancelled', cancelledAt: now, reopened: false },
      { new: true }
    );

    await WorkOrderModel.findOneAndUpdate(
      { projectId, offerVersionId: confirmedOfferVersionId },
      { status: 'cancelled', cancelledAt: now, reopened: false },
      { new: true }
    );

    if (project) {
      addTimeline(project, {
        type: 'offer',
        title: 'Potrditev ponudbe preklicana',
        description: `Verzija ${(offer && (offer as any).title) || confirmedOfferVersionId}`,
        timestamp: now.toISOString(),
        user: 'system',
      });
      await project.save();
    }

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
      return res.success({
        projectId,
        confirmedOfferVersionId: null,
        offerVersions: [],
        offers: [],
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
      workOrder: snapshot.workOrder,
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

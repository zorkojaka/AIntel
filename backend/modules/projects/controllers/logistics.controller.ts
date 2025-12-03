import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import type { MaterialOrder, ProjectLogisticsSnapshot, WorkOrder } from '../../../../shared/types/logistics';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel, addTimeline } from '../schemas/project';
import { MaterialOrderModel } from '../schemas/material-order';
import { WorkOrderModel } from '../schemas/work-order';
import type { OfferLineItem } from '../../../../shared/types/offers';
import { formatClientAddress, resolveProjectClient, serializeProjectDetails } from '../services/project.service';

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

function mapOfferItemsToLogistics(items: OfferLineItem[]) {
  return items.map((item) => {
    const note = (item as any).note;
    return {
      id: item.id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note,
    };
  });
}

type LogisticsItems = ReturnType<typeof mapOfferItemsToLogistics>;

function mapOfferItemsToWorkOrderItems(items: OfferLineItem[]) {
  return items.map((item) => {
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
    const generatedId = item.id ?? new Types.ObjectId().toString();
    const note = (item as any).note ?? undefined;
    return {
      id: generatedId,
      productId: item.productId ?? null,
      name: item.name,
      quantity,
      unit: item.unit,
      note,
      offerItemId: item.id ?? null,
      offeredQuantity: quantity,
      plannedQuantity: quantity,
      executedQuantity: quantity,
      isExtra: false,
      itemNote: null,
      isCompleted: false,
    };
  });
}

async function ensureWorkOrderForOffer(params: {
  projectId: string;
  offerId: string;
  items: ReturnType<typeof mapOfferItemsToWorkOrderItems>;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
}) {
  const { projectId, offerId, items, customerName, customerEmail, customerPhone, customerAddress } = params;
  let workOrder = await WorkOrderModel.findOne({ projectId, offerVersionId: offerId }).sort({ sequence: 1, createdAt: 1 });

  if (workOrder) {
    if ((workOrder as any).status === 'cancelled') {
      (workOrder as any).status = 'draft';
    }
    workOrder.items = items;
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
    materialOrder.items = items;
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
    status: 'draft',
    materialStatus: 'Za naročit',
    technicianId: null,
    technicianName: null,
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
      unit: item.unit,
      note: item.note,
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
    technicianId: order.technicianId ?? null,
    technicianName: order.technicianName ?? null,
    cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
    reopened: !!order.reopened,
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
  };
}

function serializeWorkOrder(order: any): WorkOrder | null {
  if (!order) return null;
  return {
    _id: String(order._id),
    projectId: order.projectId,
    offerVersionId: order.offerVersionId,
    sequence: typeof order.sequence === 'number' ? order.sequence : null,
    code: order.code ?? null,
    title: order.title ?? null,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      note: item.note,
    })),
    status: order.status,
    scheduledAt: order.scheduledAt ?? null,
    technicianName: order.technicianName,
    technicianId: order.technicianId,
    location: order.location,
    notes: order.notes,
    customerName: order.customerName ?? '',
    customerEmail: order.customerEmail ?? '',
    customerPhone: order.customerPhone ?? '',
    customerAddress: order.customerAddress ?? '',
    executionNote: typeof order.executionNote === 'string' ? order.executionNote : null,
    cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
    reopened: !!order.reopened,
    createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
    updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : '',
  };
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
  const serializedWorkOrders: WorkOrder[] = workOrderDocs
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

    const updatePayload: Record<string, unknown> = {
      confirmedOfferVersionId: offerId,
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
    const logisticsItems = mapOfferItemsToLogistics(offerItems);
    const workOrderItems = mapOfferItemsToWorkOrderItems(offerItems);
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
    });

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

    offer.status = 'cancelled';
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
      updates.scheduledAt = typeof payload.scheduledAt === 'string' ? payload.scheduledAt : null;
    }
    if ('technicianName' in payload) updates.technicianName = payload.technicianName;
    if ('technicianId' in payload) updates.technicianId = payload.technicianId;
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
            if (typeof incoming.name === 'string') target.name = incoming.name;
            if (typeof incoming.unit === 'string') target.unit = incoming.unit;
            if (typeof incoming.note === 'string' || incoming.note === null) target.note = incoming.note ?? '';
            if (typeof incoming.itemNote === 'string' || incoming.itemNote === null) {
              target.itemNote = incoming.itemNote ?? null;
            }
            if (typeof incoming.plannedQuantity === 'number') {
              target.plannedQuantity = incoming.plannedQuantity;
              target.quantity = incoming.plannedQuantity;
            }
            if (typeof incoming.executedQuantity === 'number') {
              target.executedQuantity = incoming.executedQuantity;
            }
            if (typeof incoming.isExtra === 'boolean') {
              target.isExtra = incoming.isExtra;
            }
            if (typeof incoming.isCompleted === 'boolean') {
              target.isCompleted = incoming.isCompleted;
            }
            if (typeof incoming.offerItemId === 'string' || incoming.offerItemId === null) {
              target.offerItemId = incoming.offerItemId ?? null;
            }
            return;
          }
        }
        const planned = typeof incoming.plannedQuantity === 'number' ? incoming.plannedQuantity : 0;
        const executed =
          typeof incoming.executedQuantity === 'number' ? incoming.executedQuantity : planned;
        const offered = typeof incoming.offeredQuantity === 'number' ? incoming.offeredQuantity : 0;
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
            note: incoming.note ?? '',
            offerItemId: incoming.offerItemId ?? null,
            offeredQuantity: offered,
            plannedQuantity: planned,
            executedQuantity: executed,
            isExtra: incoming.isExtra !== undefined ? !!incoming.isExtra : true,
            itemNote: typeof incoming.itemNote === 'string' ? incoming.itemNote : null,
            isCompleted: typeof incoming.isCompleted === 'boolean' ? incoming.isCompleted : false,
          });
        });
        updates.items = nextItems;
      }
    if (
      payload.status === 'draft' ||
      payload.status === 'issued' ||
      payload.status === 'in-progress' ||
      payload.status === 'confirmed' ||
      payload.status === 'completed'
    ) {
      updates.status = payload.status;
    }

    const updated = await WorkOrderModel.findOneAndUpdate({ _id: workOrderId, projectId }, { $set: updates }, { new: true });

    const materialOrderId = typeof payload.materialOrderId === 'string' ? payload.materialOrderId : null;
    if (materialOrderId) {
      const materialUpdates: Record<string, unknown> = {};
      if (typeof payload.materialStatus === 'string' && MATERIAL_STATUS_VALUES.includes(payload.materialStatus)) {
        materialUpdates.materialStatus = payload.materialStatus;
      }
      if ('materialTechnicianId' in payload) {
        materialUpdates.technicianId = payload.materialTechnicianId ?? null;
      }
      if ('materialTechnicianName' in payload) {
        materialUpdates.technicianName = payload.materialTechnicianName ?? null;
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

    return res.success(serializeWorkOrder(updated));
  } catch (err) {
    next(err);
  }
}

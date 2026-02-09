import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getDefaultDashboardStats, DashboardStats } from '../schemas/dashboardStats';
import { ProjectModel } from '../../projects/schemas/project';
import { MaterialOrderModel } from '../../projects/schemas/material-order';
import { WorkOrderModel } from '../../projects/schemas/work-order';

type UpcomingProjectSummary = {
  id: string;
  code: string;
  customerName: string;
  customerAddress?: string | null;
  confirmedOfferVersionId?: string | null;
  confirmedOfferVersionLabel?: string | null;
  createdAt: string;
  updatedAt: string;
};

type MaterialOrderSummary = {
  id: string;
  projectId: string;
  projectCode: string;
  materialStatus: string;
  itemCount: number;
  createdAt: string;
};

type WorkOrderSummary = {
  id: string;
  projectId: string;
  projectCode: string;
  scheduledAt: string | null;
  status: string;
  itemCount: number;
  createdAt: string;
};

type InstallerDashboardResponse = {
  upcomingConfirmedProjects: UpcomingProjectSummary[];
  myMaterialOrders: MaterialOrderSummary[];
  myWorkOrders: WorkOrderSummary[];
};

export function getStats(_req: Request, res: Response) {
  const metrics: DashboardStats = getDefaultDashboardStats();
  res.success(metrics);
}

function buildProjectLookup(projects: Array<{ id: string; code: string }>) {
  const lookup = new Map<string, { id: string; code: string }>();
  projects.forEach((project) => {
    lookup.set(project.id, project);
  });
  return lookup;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.toISOString();
}

export async function getInstallerDashboard(req: Request, res: Response) {
  const employeeId = (req as any)?.context?.actorEmployeeId;
  if (!employeeId || !mongoose.isValidObjectId(employeeId)) {
    const empty: InstallerDashboardResponse = {
      upcomingConfirmedProjects: [],
      myMaterialOrders: [],
      myWorkOrders: [],
    };
    return res.success(empty);
  }

  const employeeObjectId = new mongoose.Types.ObjectId(employeeId);

  const upcomingProjects = await ProjectModel.find({
    confirmedOfferVersionId: { $ne: null },
    assignedEmployeeIds: employeeObjectId,
  }).lean();

  const upcomingConfirmedProjects: UpcomingProjectSummary[] = upcomingProjects.map((project) => {
    const confirmedOfferId = project.confirmedOfferVersionId ?? null;
    const acceptedOffer =
      project.offers?.find((offer) => offer.id === confirmedOfferId) ??
      project.offers?.find((offer) => offer.status === 'accepted');
    const confirmedOfferVersionLabel = acceptedOffer
      ? acceptedOffer.label ?? `V${acceptedOffer.version}`
      : confirmedOfferId;
    const updatedAt = project.timeline?.[0]?.timestamp ?? project.createdAt;
    return {
      id: project.id,
      code: project.code,
      customerName: project.customer?.name ?? '',
      customerAddress: project.customer?.address ?? null,
      confirmedOfferVersionId: confirmedOfferId,
      confirmedOfferVersionLabel,
      createdAt: project.createdAt,
      updatedAt: updatedAt ?? project.createdAt,
    };
  });

  const materialOrders = await MaterialOrderModel.find({
    assignedEmployeeIds: employeeObjectId,
    status: { $ne: 'cancelled' },
    cancelledAt: null,
  }).lean();

  const workOrders = await WorkOrderModel.find({
    assignedEmployeeIds: employeeObjectId,
    status: { $ne: 'cancelled' },
    cancelledAt: null,
  }).lean();

  const projectIds = Array.from(
    new Set([
      ...materialOrders.map((order) => order.projectId),
      ...workOrders.map((order) => order.projectId),
    ])
  );

  const projects = projectIds.length
    ? await ProjectModel.find({ id: { $in: projectIds } }).select({ id: 1, code: 1 }).lean()
    : [];
  const projectLookup = buildProjectLookup(projects.map((project) => ({ id: project.id, code: project.code })));

  const myMaterialOrders: MaterialOrderSummary[] = materialOrders.map((order) => ({
    id: String(order._id),
    projectId: order.projectId,
    projectCode: projectLookup.get(order.projectId)?.code ?? order.projectId,
    materialStatus: order.materialStatus,
    itemCount: order.items?.length ?? 0,
    createdAt: formatDate((order as any).createdAt),
  }));

  const myWorkOrders: WorkOrderSummary[] = workOrders.map((order) => ({
    id: String(order._id),
    projectId: order.projectId,
    projectCode: projectLookup.get(order.projectId)?.code ?? order.projectId,
    scheduledAt: order.scheduledAt ?? null,
    status: order.status,
    itemCount: order.items?.length ?? 0,
    createdAt: formatDate((order as any).createdAt),
  }));

  const payload: InstallerDashboardResponse = {
    upcomingConfirmedProjects,
    myMaterialOrders,
    myWorkOrders,
  };

  return res.success(payload);
}

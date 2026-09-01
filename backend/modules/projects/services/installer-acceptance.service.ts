import crypto from 'crypto';
import mongoose from 'mongoose';

import { EmployeeModel } from '../../employees/schemas/employee';
import { ProjectModel, addTimeline } from '../schemas/project';
import { WorkOrderModel } from '../schemas/work-order';

export class InstallerAcceptanceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function assignedInstallerIds(workOrder: any): string[] {
  return Array.from(new Set([
    workOrder.mainInstallerId ? String(workOrder.mainInstallerId) : '',
    ...(Array.isArray(workOrder.assignedEmployeeIds) ? workOrder.assignedEmployeeIds.map(String) : []),
  ].filter((id) => mongoose.isValidObjectId(id))));
}

export async function ensureInstallerAcceptanceTokens(workOrder: any) {
  const employeeIds = assignedInstallerIds(workOrder);
  const existing = Array.isArray(workOrder.installerAcceptances) ? workOrder.installerAcceptances : [];
  const byEmployeeId = new Map(existing.map((entry: any) => [String(entry.employeeId), entry]));
  workOrder.installerAcceptances = employeeIds.map((employeeId) => {
    const entry: any = byEmployeeId.get(employeeId);
    return entry ?? {
      employeeId: new mongoose.Types.ObjectId(employeeId),
      token: crypto.randomBytes(24).toString('hex'),
      emailSentAt: null,
      acceptedAt: null,
      acceptedVia: undefined,
    };
  });
  await workOrder.save();
  return workOrder.installerAcceptances as any[];
}

export async function markInstallerAcceptanceEmailSent(workOrderId: string, employeeIds: string[]) {
  const sentAt = new Date();
  await WorkOrderModel.updateOne(
    { _id: workOrderId },
    { $set: { 'installerAcceptances.$[entry].emailSentAt': sentAt } },
    { arrayFilters: [{ 'entry.employeeId': { $in: employeeIds.map((id) => new mongoose.Types.ObjectId(id)) } }] },
  );
}

async function recordAcceptance(workOrder: any, employeeId: string, via: 'system' | 'email' | 'admin') {
  const entry = (workOrder.installerAcceptances ?? []).find((item: any) => String(item.employeeId) === employeeId);
  if (!entry) throw new InstallerAcceptanceError('Monter ni dodeljen temu delovnemu nalogu.', 403);
  const isNewAcceptance = !entry.acceptedAt;
  if (isNewAcceptance) {
    entry.acceptedAt = new Date();
    entry.acceptedVia = via;
  }
  const allAssignedInstallersAccepted = (workOrder.installerAcceptances ?? []).length > 0
    && (workOrder.installerAcceptances ?? []).every((item: any) => Boolean(item.acceptedAt));
  const shouldPromoteStatus = workOrder.status === 'issued' && allAssignedInstallersAccepted;
  if (shouldPromoteStatus) {
    workOrder.status = 'confirmed';
  }
  if (isNewAcceptance || shouldPromoteStatus) {
    await workOrder.save();
  }

  if (isNewAcceptance) {
    const [employee, project] = await Promise.all([
      EmployeeModel.findById(employeeId).select({ name: 1 }).lean(),
      ProjectModel.findOne({ id: workOrder.projectId }),
    ]);
    if (project) {
      addTimeline(project, {
        type: 'edit',
        title: 'Monter sprejel delovni nalog',
        description: `${employee?.name ?? 'Monter'} je potrdil, da je delovni nalog videl in sprejel.`,
        timestamp: new Date().toLocaleString('sl-SI'),
        user: employee?.name ?? 'Monter',
        metadata: { workOrderId: String(workOrder._id), employeeId, via },
      });
      await project.save();
    }
  }
  return { projectId: workOrder.projectId, workOrderId: String(workOrder._id), employeeId, acceptedAt: entry.acceptedAt as Date };
}

export async function acceptInstallerAssignmentInSystem(input: {
  projectId: string;
  workOrderId: string;
  employeeId: string;
}) {
  if (!mongoose.isValidObjectId(input.employeeId)) {
    throw new InstallerAcceptanceError('Uporabnik ni povezan z monterjem.', 403);
  }
  const workOrder = await WorkOrderModel.findOne({
    _id: input.workOrderId,
    projectId: input.projectId,
    cancelledAt: null,
  });
  if (!workOrder) throw new InstallerAcceptanceError('Delovni nalog ni najden.', 404);
  await ensureInstallerAcceptanceTokens(workOrder);
  return recordAcceptance(workOrder, input.employeeId, 'system');
}

export async function confirmAllInstallerAssignmentsByAdmin(input: {
  projectId: string;
  workOrderId: string;
  actorName: string;
}) {
  const workOrder = await WorkOrderModel.findOne({
    _id: input.workOrderId,
    projectId: input.projectId,
    cancelledAt: null,
  });
  if (!workOrder) throw new InstallerAcceptanceError('Delovni nalog ni najden.', 404);

  const entries = await ensureInstallerAcceptanceTokens(workOrder);
  if (entries.length === 0) throw new InstallerAcceptanceError('Delovni nalog nima dodeljenih monterjev.', 409);

  const acceptedAt = new Date();
  const confirmedEmployeeIds: string[] = [];
  for (const entry of entries) {
    if (entry.acceptedAt) continue;
    entry.acceptedAt = acceptedAt;
    entry.acceptedVia = 'admin';
    confirmedEmployeeIds.push(String(entry.employeeId));
  }
  const shouldPromoteStatus = workOrder.status === 'issued' && entries.every((entry: any) => Boolean(entry.acceptedAt));
  if (shouldPromoteStatus) {
    workOrder.status = 'confirmed';
  }
  if (confirmedEmployeeIds.length > 0 || shouldPromoteStatus) {
    await workOrder.save();
  }
  if (confirmedEmployeeIds.length > 0) {
    const [employees, project] = await Promise.all([
      EmployeeModel.find({ _id: { $in: confirmedEmployeeIds } }).select({ name: 1 }).lean(),
      ProjectModel.findOne({ id: workOrder.projectId }),
    ]);
    if (project) {
      const names = employees.map((employee) => employee.name).filter(Boolean).join(', ') || 'dodeljeni monterji';
      addTimeline(project, {
        type: 'edit',
        title: 'Administrator ročno potrdil monterje',
        description: `${input.actorName} je potrdil, da so delovni nalog videli in sprejeli: ${names}.`,
        timestamp: acceptedAt.toLocaleString('sl-SI'),
        user: input.actorName,
        metadata: { workOrderId: String(workOrder._id), employeeIds: confirmedEmployeeIds.join(','), via: 'admin' },
      });
      await project.save();
    }
  }
  return { confirmedEmployeeIds, acceptedAt };
}

export async function acceptInstallerAssignmentByToken(token: unknown) {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!/^[a-f0-9]{48}$/i.test(clean)) throw new InstallerAcceptanceError('Povezava ni veljavna.', 404);
  const workOrder = await WorkOrderModel.findOne({
    'installerAcceptances.token': clean,
    cancelledAt: null,
  });
  if (!workOrder) throw new InstallerAcceptanceError('Povezava ni veljavna.', 404);
  const entry = (workOrder.installerAcceptances ?? []).find((item: any) => item.token === clean);
  if (!entry) throw new InstallerAcceptanceError('Povezava ni veljavna.', 404);
  return recordAcceptance(workOrder, String(entry.employeeId), 'email');
}

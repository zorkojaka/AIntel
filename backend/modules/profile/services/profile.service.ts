import mongoose from 'mongoose';

import { EmployeeModel } from '../../employees/schemas/employee';
import { FinanceSnapshotModel } from '../../finance/schemas/finance-snapshot';
import { EmployeeServiceRateModel } from '../../employee-profiles/schemas/employee-service-rate';
import { ProductModel } from '../../cenik/product.model';
import { ProjectModel } from '../../projects/schemas/project';
import { WorkOrderModel } from '../../projects/schemas/work-order';

type ProfileContext = {
  tenantId: string;
  userId: string;
  employeeId: string | null;
};

type ProjectFilter = 'all' | 'upcoming' | 'completed';

function toObjectId(value: string) {
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' });
}

function normalizeMoney(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : 0;
}

function normalizeQuantity(value: unknown, fallback = 1) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function getEmployeeEarning(snapshot: any, employeeId: string) {
  return (snapshot.employeeEarnings ?? []).find((earning: any) => String(earning.employeeId) === employeeId) ?? null;
}

function normalizeEmployeeId(value: unknown): string | null {
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
      return normalizeEmployeeId(nestedValue);
    }
    if (typeof (value as { toString?: unknown }).toString === 'function') {
      const stringValue = String(value);
      return stringValue && stringValue !== '[object Object]' ? stringValue : null;
    }
  }
  return null;
}

function getCompletedBy(item: any): string | null {
  return (
    normalizeEmployeeId(item?.completedBy) ??
    normalizeEmployeeId(item?.completedByEmployeeId) ??
    normalizeEmployeeId(item?.executedBy) ??
    normalizeEmployeeId(item?.executedByEmployeeId) ??
    normalizeEmployeeId(item?.markedDoneBy) ??
    normalizeEmployeeId(item?.markedDoneByEmployeeId) ??
    normalizeEmployeeId(item?.doneBy) ??
    normalizeEmployeeId(item?.doneByEmployeeId)
  );
}

function getCompletedDateCandidates(workOrders: any[], employeeId: string) {
  const dates: Date[] = [];
  workOrders.forEach((workOrder) => {
    if (workOrder.customerSignedAt) dates.push(new Date(workOrder.customerSignedAt));
    (workOrder.items ?? []).forEach((item: any) => {
      if (String(getCompletedBy(item)) === employeeId && item.completedAt) {
        dates.push(new Date(item.completedAt));
      }
      (item.executionSpec?.executionUnits ?? []).forEach((unit: any) => {
        if (String(getCompletedBy(unit)) === employeeId && unit.completedAt) {
          dates.push(new Date(unit.completedAt));
        }
      });
    });
  });
  return dates.filter((date) => !Number.isNaN(date.valueOf()));
}

function getProjectCompletionDate(project: any, workOrders: any[], snapshot: any, employeeId: string) {
  const completedDates = getCompletedDateCandidates(workOrders, employeeId).sort((a, b) => b.valueOf() - a.valueOf());
  if (completedDates[0]) return completedDates[0];
  if (snapshot?.issuedAt) return new Date(snapshot.issuedAt);
  return getProjectDate(project, workOrders, snapshot);
}

function getMatchingServiceItemsForSnapshotItem(workOrders: any[], snapshotItem: any) {
  const productId = snapshotItem.productId ? String(snapshotItem.productId) : null;
  const name = typeof snapshotItem.name === 'string' ? snapshotItem.name.trim().toLowerCase() : '';
  return workOrders.flatMap((workOrder) =>
    (workOrder.items ?? []).filter((item: any) => {
      if (item.isService !== true) return false;
      if (productId && item.productId && String(item.productId) === productId) return true;
      return Boolean(name && typeof item.name === 'string' && item.name.trim().toLowerCase() === name);
    }),
  );
}

async function getEmployeeServiceUnitPrice(employeeId: string, serviceProductId: string, snapshotUnitPriceSale: number) {
  const employeeObjectId = toObjectId(employeeId);
  const productObjectId = toObjectId(serviceProductId);
  if (!employeeObjectId || !productObjectId) return 0;

  const rate = await EmployeeServiceRateModel.findOne({
    employeeId: employeeObjectId,
    serviceProductId: productObjectId,
    isActive: true,
  }).lean();
  if (!rate) return 0;

  const overridePrice = rate.overridePrice === null || rate.overridePrice === undefined ? null : normalizeMoney(rate.overridePrice);
  return overridePrice ?? normalizeMoney(snapshotUnitPriceSale * (normalizeMoney(rate.defaultPercent) / 100));
}

async function buildEmployeeEarningItems(employeeId: string, snapshot: any, workOrders: any[]) {
  const items: Array<{ name: string; quantity: number; unit: string; unitPrice: number; total: number }> = [];

  for (const snapshotItem of snapshot.items ?? []) {
    if (!snapshotItem.isService || !snapshotItem.productId) continue;

    const unitPrice = await getEmployeeServiceUnitPrice(employeeId, String(snapshotItem.productId), normalizeMoney(snapshotItem.unitPriceSale));
    if (unitPrice <= 0) continue;

    let quantity = 0;
    const workOrderItems = getMatchingServiceItemsForSnapshotItem(workOrders, snapshotItem);
    workOrderItems.forEach((workOrderItem: any) => {
      const executionUnits = workOrderItem.executionSpec?.executionUnits ?? [];
      if (executionUnits.length === 0) {
        if (!workOrderItem.isCompleted || String(getCompletedBy(workOrderItem)) !== employeeId) return;
        quantity += normalizeQuantity(workOrderItem.executedQuantity, normalizeQuantity(snapshotItem.quantity, 1));
        return;
      }
      executionUnits.forEach((unit: any) => {
        if (unit.isCompleted && String(getCompletedBy(unit)) === employeeId) {
          quantity += 1;
        }
      });
    });

    if (quantity > 0) {
      items.push({
        name: snapshotItem.name,
        quantity,
        unit: snapshotItem.unit,
        unitPrice,
        total: normalizeMoney(unitPrice * quantity),
      });
    }
  }

  return items;
}

function getProjectDate(project: any, workOrders: any[], snapshot: any = null) {
  const scheduled = workOrders
    .map((workOrder) => (workOrder.scheduledAt ? new Date(workOrder.scheduledAt) : null))
    .filter((date): date is Date => !!date && !Number.isNaN(date.valueOf()))
    .sort((a, b) => a.valueOf() - b.valueOf())[0];
  if (scheduled) return scheduled;
  if (snapshot?.issuedAt) return new Date(snapshot.issuedAt);
  return new Date(project.createdAt);
}

function workOrderParticipationQuery(employeeId: string) {
  const employeeObjectId = toObjectId(employeeId);
  const ids = [employeeId, ...(employeeObjectId ? [employeeObjectId] : [])];
  return {
    $or: [
      { assignedEmployeeIds: { $in: ids } },
      { mainInstallerId: { $in: ids } },
      { 'workLogs.employeeId': employeeId },
      { 'items.completedBy': { $in: ids } },
      { 'items.executionSpec.executionUnits.completedBy': { $in: ids } },
      { 'items.executionSpec.executionUnits.completedByEmployeeId': { $in: ids } },
      { 'items.executionSpec.executionUnits.executedBy': { $in: ids } },
      { 'items.executionSpec.executionUnits.executedByEmployeeId': { $in: ids } },
      { 'items.executionSpec.executionUnits.markedDoneBy': { $in: ids } },
      { 'items.executionSpec.executionUnits.markedDoneByEmployeeId': { $in: ids } },
      { 'items.executionSpec.executionUnits.doneBy': { $in: ids } },
      { 'items.executionSpec.executionUnits.doneByEmployeeId': { $in: ids } },
    ],
  };
}

async function getProfileEmployee(context: ProfileContext) {
  if (!context.employeeId) return null;
  return EmployeeModel.findOne({
    _id: context.employeeId,
    tenantId: context.tenantId,
    deletedAt: null,
  }).lean();
}

async function listParticipantWorkOrders(employeeId: string) {
  return WorkOrderModel.find(workOrderParticipationQuery(employeeId)).lean();
}

async function listUserSnapshots(employeeId: string) {
  return FinanceSnapshotModel.find({
    superseded: { $ne: true },
    'employeeEarnings.employeeId': employeeId,
  })
    .sort({ issuedAt: -1 })
    .lean();
}

function calculateSnapshotRange(snapshots: any[], employeeId: string, from: Date, to: Date) {
  const projectIds = new Set<string>();
  const earnings = snapshots.reduce((sum, snapshot) => {
    const issuedAt = new Date(snapshot.issuedAt);
    if (Number.isNaN(issuedAt.valueOf()) || issuedAt < from || issuedAt >= to) return sum;
    const earning = getEmployeeEarning(snapshot, employeeId);
    if (!earning) return sum;
    projectIds.add(String(snapshot.projectId));
    return sum + normalizeMoney(earning.earnings);
  }, 0);
  return { earnings: normalizeMoney(earnings), projectCount: projectIds.size };
}

export async function getProfileOverview(context: ProfileContext) {
  const employee = await getProfileEmployee(context);
  const now = new Date();

  if (!employee || !context.employeeId) {
    return {
      name: '',
      email: '',
      role: '',
      employeeId: null,
      hireDate: null,
      kpis: {
        thisMonth: { earnings: 0, projectCount: 0 },
        thisYear: { earnings: 0, projectCount: 0 },
        lastWeek: { earnings: 0, projectCount: 0 },
        allTime: { projectCount: 0 },
      },
      nextProject: null,
    };
  }

  const [snapshots, workOrders] = await Promise.all([
    listUserSnapshots(context.employeeId),
    listParticipantWorkOrders(context.employeeId),
  ]);

  const thisMonth = calculateSnapshotRange(snapshots, context.employeeId, startOfMonth(now), addMonths(startOfMonth(now), 1));
  const thisYear = calculateSnapshotRange(snapshots, context.employeeId, startOfYear(now), new Date(now.getFullYear() + 1, 0, 1));
  const lastWeek = calculateSnapshotRange(
    snapshots,
    context.employeeId,
    new Date(startOfDay(now).valueOf() - 7 * 24 * 60 * 60 * 1000),
    new Date(now.valueOf() + 1),
  );

  const projectIds = new Set<string>([
    ...snapshots.map((snapshot) => String(snapshot.projectId)),
    ...workOrders.map((workOrder) => String(workOrder.projectId)),
  ]);

  const upcomingWorkOrders = workOrders
    .filter((workOrder) => {
      const date = workOrder.scheduledAt ? new Date(workOrder.scheduledAt) : null;
      return date && !Number.isNaN(date.valueOf()) && date >= now && workOrder.status !== 'completed';
    })
    .sort((a, b) => new Date(a.scheduledAt ?? 0).valueOf() - new Date(b.scheduledAt ?? 0).valueOf());

  let nextProject = null;
  if (upcomingWorkOrders[0]) {
    const project = await ProjectModel.findOne({ id: upcomingWorkOrders[0].projectId }).lean();
    nextProject = {
      id: String(upcomingWorkOrders[0].projectId),
      date: upcomingWorkOrders[0].scheduledAt,
      customer: project?.customer?.name ?? upcomingWorkOrders[0].customerName ?? '-',
      address: upcomingWorkOrders[0].location ?? project?.customer?.address ?? upcomingWorkOrders[0].customerAddress ?? '',
    };
  }

  return {
    name: employee.name,
    email: employee.email ?? '',
    role: (employee.roles ?? []).join(', '),
    employeeId: String(employee._id),
    hireDate: employee.employmentStartDate ? employee.employmentStartDate.toISOString() : null,
    kpis: {
      thisMonth,
      thisYear,
      lastWeek,
      allTime: { projectCount: projectIds.size },
    },
    nextProject,
  };
}

export async function getMyProjects(context: ProfileContext, filter: ProjectFilter) {
  if (!context.employeeId) return [];
  const [workOrders, snapshots] = await Promise.all([
    listParticipantWorkOrders(context.employeeId),
    listUserSnapshots(context.employeeId),
  ]);
  const workOrdersByProject = new Map<string, any[]>();
  workOrders.forEach((workOrder) => {
    const list = workOrdersByProject.get(String(workOrder.projectId)) ?? [];
    list.push(workOrder);
    workOrdersByProject.set(String(workOrder.projectId), list);
  });

  const snapshotByProject = new Map<string, any>();
  snapshots.forEach((snapshot) => {
    snapshotByProject.set(String(snapshot.projectId), snapshot);
  });

  const projectIds = Array.from(new Set([...workOrdersByProject.keys(), ...snapshotByProject.keys()]));
  if (!projectIds.length) return [];

  const projects = await ProjectModel.find({ id: { $in: projectIds } }).lean();
  const now = new Date();

  return projects
    .map((project) => {
      const projectWorkOrders = workOrdersByProject.get(project.id) ?? [];
      const snapshot = snapshotByProject.get(project.id) ?? null;
      const earning = snapshot ? getEmployeeEarning(snapshot, context.employeeId!) : null;
      const date = getProjectDate(project, projectWorkOrders, snapshot);
      const hasUpcoming = projectWorkOrders.some((workOrder) => {
        const scheduledAt = workOrder.scheduledAt ? new Date(workOrder.scheduledAt) : null;
        return scheduledAt && !Number.isNaN(scheduledAt.valueOf()) && scheduledAt >= now && workOrder.status !== 'completed';
      });
      const completed = ['completed', 'invoiced'].includes(project.status) || projectWorkOrders.some((workOrder) => workOrder.status === 'completed');
      return {
        id: project.id,
        title: project.title,
        date: date.toISOString(),
        customer: project.customer?.name ?? snapshot?.customer?.name ?? '-',
        address: project.customer?.address ?? snapshot?.customer?.address ?? '',
        categories: project.categories ?? [],
        earnings: normalizeMoney(earning?.earnings ?? 0),
        isPaid: Boolean(earning?.isPaid),
        paymentStatus: earning?.isPaid ? 'paid' : 'pending',
        status: project.status,
        isUpcoming: hasUpcoming,
        isCompleted: completed,
      };
    })
    .filter((project) => {
      if (filter === 'upcoming') return project.isUpcoming;
      if (filter === 'completed') return project.isCompleted;
      return true;
    })
    .sort((a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf());
}

export async function getMyEarnings(context: ProfileContext, year: number) {
  if (!context.employeeId) {
    return { monthlyChart: [], summary: { totalThisYear: 0, totalPending: 0, totalPaid: 0 }, table: [] };
  }

  const snapshots = await listUserSnapshots(context.employeeId);
  const now = new Date();
  const chartStart = addMonths(startOfMonth(now), -11);
  const months = Array.from({ length: 12 }, (_, index) => monthKey(addMonths(chartStart, index)));
  const monthMap = new Map(months.map((key) => [key, { amount: 0, projectIds: new Set<string>() }]));
  const tableMap = new Map<string, { earnings: number; projectIds: Set<string>; paid: number; pending: number }>();
  let totalThisYear = 0;
  let totalPending = 0;
  let totalPaid = 0;

  snapshots.forEach((snapshot) => {
    const earning = getEmployeeEarning(snapshot, context.employeeId!);
    if (!earning) return;
    const amount = normalizeMoney(earning.earnings);
    const issuedAt = new Date(snapshot.issuedAt);
    if (Number.isNaN(issuedAt.valueOf())) return;
    const key = monthKey(issuedAt);
    const chartMonth = monthMap.get(key);
    if (chartMonth) {
      chartMonth.amount += amount;
      chartMonth.projectIds.add(String(snapshot.projectId));
    }
    if (issuedAt.getFullYear() === year) {
      totalThisYear += amount;
      if (earning.isPaid) totalPaid += amount;
      else totalPending += amount;
      const tableMonth = tableMap.get(key) ?? { earnings: 0, projectIds: new Set<string>(), paid: 0, pending: 0 };
      tableMonth.earnings += amount;
      tableMonth.projectIds.add(String(snapshot.projectId));
      if (earning.isPaid) tableMonth.paid += amount;
      else tableMonth.pending += amount;
      tableMap.set(key, tableMonth);
    }
  });

  return {
    monthlyChart: months.map((key) => {
      const row = monthMap.get(key)!;
      return {
        month: monthLabelFromKey(key),
        amount: normalizeMoney(row.amount),
        projectCount: row.projectIds.size,
      };
    }),
    summary: {
      totalThisYear: normalizeMoney(totalThisYear),
      totalPending: normalizeMoney(totalPending),
      totalPaid: normalizeMoney(totalPaid),
    },
    table: Array.from(tableMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, row]) => ({
        month: monthLabelFromKey(key),
        projectCount: row.projectIds.size,
        earnings: normalizeMoney(row.earnings),
        isPaid: row.pending <= 0,
      })),
  };
}

export async function getMyProjectEarnings(context: ProfileContext) {
  if (!context.employeeId) return [];

  const snapshots = await listUserSnapshots(context.employeeId);
  const snapshotByProject = new Map<string, any>();
  snapshots.forEach((snapshot) => {
    const earning = getEmployeeEarning(snapshot, context.employeeId!);
    if (!earning || normalizeMoney(earning.earnings) <= 0) return;
    const projectId = String(snapshot.projectId);
    if (!snapshotByProject.has(projectId)) {
      snapshotByProject.set(projectId, snapshot);
    }
  });

  const projectIds = Array.from(snapshotByProject.keys());
  if (!projectIds.length) return [];

  const [projects, workOrders] = await Promise.all([
    ProjectModel.find({ id: { $in: projectIds }, status: { $in: ['completed', 'invoiced'] } }).lean(),
    WorkOrderModel.find({ projectId: { $in: projectIds } }).lean(),
  ]);

  const workOrdersByProject = new Map<string, any[]>();
  workOrders.forEach((workOrder) => {
    const projectWorkOrders = workOrdersByProject.get(String(workOrder.projectId)) ?? [];
    projectWorkOrders.push(workOrder);
    workOrdersByProject.set(String(workOrder.projectId), projectWorkOrders);
  });

  const rows = await Promise.all(projects.map(async (project) => {
    const snapshot = snapshotByProject.get(project.id);
    const earning = snapshot ? getEmployeeEarning(snapshot, context.employeeId!) : null;
    if (!snapshot || !earning || normalizeMoney(earning.earnings) <= 0) return null;

    const projectWorkOrders = workOrdersByProject.get(project.id) ?? [];
    return {
      id: project.id,
      title: project.title,
      completedAt: getProjectCompletionDate(project, projectWorkOrders, snapshot, context.employeeId!).toISOString(),
      customer: project.customer?.name ?? snapshot.customer?.name ?? '-',
      totalEarnings: normalizeMoney(earning.earnings),
      isPaid: Boolean(earning.isPaid),
      paymentStatus: earning.isPaid ? 'paid' : 'pending',
      items: await buildEmployeeEarningItems(context.employeeId!, snapshot, projectWorkOrders),
    };
  }));

  return rows
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => new Date(b.completedAt).valueOf() - new Date(a.completedAt).valueOf());
}

export async function getMyServiceRates(context: ProfileContext) {
  if (!context.employeeId) return [];
  const employeeObjectId = toObjectId(context.employeeId);
  if (!employeeObjectId) return [];

  const rates = await EmployeeServiceRateModel.find({
    employeeId: employeeObjectId,
    isActive: true,
  }).lean();

  const productIds = rates.map((rate) => rate.serviceProductId).filter(Boolean);
  const products = await ProductModel.find({ _id: { $in: productIds } }).select('ime prodajnaCena').lean();
  const productMap = new Map<string, { name: string; price: number }>(
    products.map((product) => [
      String(product._id),
      {
        name: product.ime,
        price: normalizeMoney(product.prodajnaCena),
      },
    ]),
  );

  return rates
    .map((rate) => {
      const product = productMap.get(String(rate.serviceProductId));
      const servicePrice = product?.price ?? 0;
      const overridePrice = normalizeMoney(rate.overridePrice);
      const employeeEarnsAmount = overridePrice > 0
        ? overridePrice
        : normalizeMoney((normalizeMoney(rate.defaultPercent) / 100) * servicePrice);

      return {
        serviceProductId: String(rate.serviceProductId),
        serviceName: product?.name ?? 'Storitev',
        servicePrice,
        employeeEarnsAmount,
      };
    })
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName, 'sl'));
}

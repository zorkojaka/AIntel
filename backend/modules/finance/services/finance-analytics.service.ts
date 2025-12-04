import { ProjectModel } from '../../projects/schemas/project';
import { WorkOrderModel } from '../../projects/schemas/work-order';
import { ProductModel } from '../../cenik/product.model';
import { EmployeeModel } from '../../employees/schemas/employee';

type DateRange = { from?: Date; to?: Date };

type InvoiceVersion = {
  _id: string;
  status: string;
  issuedAt?: string | null;
  summary?: { baseWithoutVat?: number; discountedBase?: number; vatAmount?: number; totalWithVat?: number };
  items?: { totalWithVat?: number; totalWithoutVat?: number; vatPercent?: number }[];
};

type ProjectLike = {
  id: string;
  title?: string;
  customer?: { name?: string };
  invoiceVersions?: InvoiceVersion[];
};

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function isWithinRange(value: Date | null, range: DateRange) {
  if (!value) return false;
  if (range.from && value < range.from) return false;
  if (range.to && value > range.to) return false;
  return true;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRevenueFromInvoice(invoice: InvoiceVersion) {
  if (invoice.summary?.totalWithVat !== undefined) {
    return {
      revenueWithVat: safeNumber(invoice.summary.totalWithVat),
      revenueWithoutVat: safeNumber(invoice.summary.discountedBase ?? invoice.summary.baseWithoutVat ?? 0),
    };
  }
  const items = invoice.items ?? [];
  const revenueWithVat = items.reduce((sum, item) => sum + safeNumber(item.totalWithVat), 0);
  const revenueWithoutVat = items.reduce((sum, item) => sum + safeNumber(item.totalWithoutVat), 0);
  return { revenueWithVat, revenueWithoutVat };
}

export async function getProjectsSummary(range: DateRange) {
  const [projects, workOrders, products, employees] = await Promise.all([
    ProjectModel.find().lean(),
    WorkOrderModel.find().lean(),
    ProductModel.find().lean(),
    EmployeeModel.find().lean(),
  ]);

  const productPriceMap = new Map<string, number>();
  products.forEach((product: any) => {
    const purchase = product.purchasePriceWithoutVat ?? product.nabavnaCena ?? 0;
    productPriceMap.set(String(product._id ?? product.id), purchase);
  });

  const employeeMap = new Map<string, { name: string; rate: number }>();
  employees.forEach((employee: any) => {
    employeeMap.set(String(employee._id ?? employee.id), {
      name: employee.name ?? '',
      rate: safeNumber(employee.hourRateWithoutVat, 0),
    });
  });

  const workOrdersByProject = new Map<string, any[]>();
  workOrders.forEach((order: any) => {
    const projectId = order.projectId;
    if (!workOrdersByProject.has(projectId)) {
      workOrdersByProject.set(projectId, []);
    }
    workOrdersByProject.get(projectId)!.push(order);
  });

  return (projects as ProjectLike[]).map((project) => {
    const issuedInvoices = (project.invoiceVersions ?? []).filter((invoice) => invoice.status === 'issued');
    const filteredInvoices = issuedInvoices.filter((invoice) =>
      isWithinRange(normalizeDate(invoice.issuedAt ?? null), range)
    );
    const revenue = filteredInvoices.reduce(
      (acc, invoice) => {
        const { revenueWithVat, revenueWithoutVat } = getRevenueFromInvoice(invoice);
        acc.revenueWithVat += revenueWithVat;
        acc.revenueWithoutVat += revenueWithoutVat;
        return acc;
      },
      { revenueWithVat: 0, revenueWithoutVat: 0 }
    );

    const materialCost = (workOrdersByProject.get(project.id) ?? []).reduce((sum, order) => {
      return sum + (order.items ?? []).reduce((itemSum: number, item: any) => {
        const price = productPriceMap.get(String(item.productId)) ?? 0;
        const executed = safeNumber(item.executedQuantity, 0);
        return itemSum + executed * price;
      }, 0);
    }, 0);

    const labourDetails = (workOrdersByProject.get(project.id) ?? []).reduce(
      (acc, order) => {
        (order.workLogs ?? []).forEach((log: any) => {
          const rate = employeeMap.get(String(log.employeeId))?.rate ?? 0;
          acc.labourCost += safeNumber(log.hours, 0) * rate;
          acc.names.add(employeeMap.get(String(log.employeeId))?.name || String(log.employeeId));
          acc.hours += safeNumber(log.hours, 0);
        });
        return acc;
      },
      { labourCost: 0, names: new Set<string>(), hours: 0 }
    );

    const profitWithoutVat = revenue.revenueWithoutVat - (materialCost + labourDetails.labourCost);
    const profitMarginPercent = revenue.revenueWithoutVat > 0
      ? (profitWithoutVat / revenue.revenueWithoutVat) * 100
      : 0;

    return {
      projectId: project.id,
      projectName: project.title ?? project.id,
      company: '',
      revenueWithVat: revenue.revenueWithVat,
      materialCostWithoutVat: materialCost,
      labourCostWithoutVat: labourDetails.labourCost,
      otherCostWithoutVat: 0,
      profitWithoutVat,
      profitMarginPercent,
      mainTechnicianNames: Array.from(labourDetails.names),
      totalHours: labourDetails.hours,
    };
  });
}

export async function getMonthlySummary(range: DateRange) {
  const projects = await getProjectsSummary(range);
  const buckets = new Map<string, any>();

  projects.forEach((project) => {
    const key = 'aggregate';
    if (!buckets.has(key)) {
      buckets.set(key, {
        yearMonth: key,
        projectCount: 0,
        revenueWithVat: 0,
        materialCostWithoutVat: 0,
        labourCostWithoutVat: 0,
        profitWithoutVat: 0,
      });
    }
    const bucket = buckets.get(key)!;
    bucket.projectCount += 1;
    bucket.revenueWithVat += project.revenueWithVat;
    bucket.materialCostWithoutVat += project.materialCostWithoutVat;
    bucket.labourCostWithoutVat += project.labourCostWithoutVat;
    bucket.profitWithoutVat += project.profitWithoutVat;
  });

  return Array.from(buckets.values());
}

export async function getEmployeesSummary(range: DateRange) {
  const [workOrders, employees] = await Promise.all([WorkOrderModel.find().lean(), EmployeeModel.find().lean()]);

  const employeeMap = new Map<string, { name: string; rate: number }>();
  employees.forEach((employee: any) => {
    employeeMap.set(String(employee._id ?? employee.id), {
      name: employee.name ?? '',
      rate: safeNumber(employee.hourRateWithoutVat, 0),
    });
  });

  const totals = new Map<
    string,
    { employeeId: string; name: string; hours: number; projects: Set<string>; labourCost: number }
  >();

  workOrders.forEach((order: any) => {
    (order.workLogs ?? []).forEach((log: any) => {
      const key = String(log.employeeId);
      const bucket =
        totals.get(key) ?? {
          employeeId: key,
          name: employeeMap.get(key)?.name || key,
          hours: 0,
          projects: new Set<string>(),
          labourCost: 0,
        };
      bucket.hours += safeNumber(log.hours, 0);
      bucket.labourCost += safeNumber(log.hours, 0) * (employeeMap.get(key)?.rate ?? 0);
      if (order.projectId) {
        bucket.projects.add(String(order.projectId));
      }
      totals.set(key, bucket as any);
    });
  });

  return Array.from(totals.values()).map((entry) => ({
    employeeId: entry.employeeId,
    employeeName: entry.name,
    totalHours: entry.hours,
    projectsCount: entry.projects.size,
    labourCostWithoutVat: entry.labourCost,
    revenueWithVatApprox: 0,
  }));
}

export async function getIssuedInvoices(range: DateRange) {
  const projects = await ProjectModel.find().lean();
  const results: any[] = [];
  projects.forEach((project: any) => {
    (project.invoiceVersions ?? [])
      .filter((invoice: InvoiceVersion) => invoice.status === 'issued')
      .forEach((invoice: InvoiceVersion) => {
        const issuedAt = normalizeDate(invoice.issuedAt ?? null);
        if (!isWithinRange(issuedAt, range)) return;
        const { revenueWithVat } = getRevenueFromInvoice(invoice);
        results.push({
          invoiceId: invoice._id,
          projectId: project.id,
          projectName: project.title ?? project.id,
          dateIssued: issuedAt ? issuedAt.toISOString() : null,
          customerName: project.customer?.name ?? '',
          totalWithVat: revenueWithVat,
          pdfAvailable: true,
        });
      });
  });
  return results;
}

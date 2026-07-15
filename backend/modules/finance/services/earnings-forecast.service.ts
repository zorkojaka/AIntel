/**
 * Napoved zaslužka monterja iz POTRJENIH, še ne zaračunanih ponudb.
 *
 * Razmerje do resnice: ob izdaji računa finance-snapshot.service pripiše zaslužek
 * monterju, ki je postavko DEJANSKO opravil (completedBy). Pri napovedi delo še ni
 * opravljeno, zato tega podatka ni — zaslužek zato razdelimo med monterje, ki so
 * projektu DODELJENI. Napoved je ocena; resnica ostane račun.
 *
 * Cene so iste kot pri računu (EmployeeServiceRate: overridePrice ali
 * defaultPercent od prodajne cene), vključno s preslikavo združenih produktov
 * (mergedIntoProductId), da se napoved in obračun ne razhajata.
 */
import { isValidObjectId } from 'mongoose';

import { ProductModel } from '../../cenik/product.model';
import { EmployeeServiceRateModel } from '../../employee-profiles/schemas/employee-service-rate';
import { OfferVersionModel } from '../../projects/schemas/offer-version';
import { ProjectModel } from '../../projects/schemas/project';
import { WorkOrderModel } from '../../projects/schemas/work-order';

export interface ForecastProject {
  projectId: string;
  code: string;
  title: string;
  customerName: string;
  status: string;
  /** Datum potrditve ponudbe — po njem se napoved razvrsti v mesece. */
  acceptedAt: string | null;
  /** Mesec potrditve (YYYY-MM) ali null, če ponudba nima datuma potrditve. */
  month: string | null;
  earnings: number;
  /** Med koliko dodeljenih monterjev je zaslužek razdeljen (1 = sam). */
  sharedBetween: number;
  /** Storitve brez nastavljene cene za tega monterja — zaslužek je zato podcenjen. */
  servicesWithoutRate: string[];
}

export interface ForecastMonth {
  month: string | null;
  label: string;
  earnings: number;
  projectCount: number;
}

export interface EarningsForecast {
  employeeId: string;
  totalEarnings: number;
  projects: ForecastProject[];
  months: ForecastMonth[];
}

const MESECI = [
  'januar', 'februar', 'marec', 'april', 'maj', 'junij',
  'julij', 'avgust', 'september', 'oktober', 'november', 'december',
];

function round(value: number) {
  return Number(Number(value).toFixed(2));
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeId(value: unknown) {
  return value ? String(value) : '';
}

function monthKey(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string | null) {
  if (!key) return 'Brez datuma potrditve';
  const [year, month] = key.split('-').map(Number);
  return `${MESECI[month - 1]} ${year}`;
}

/** Enaka preslikava kot pri obračunu: cena se vodi na produktu, v katerega je bil združen. */
async function resolveRateProductId(productId: string) {
  if (!isValidObjectId(productId)) return productId;
  const product = await ProductModel.findById(productId).select('_id mergedIntoProductId').lean();
  const merged = normalizeId((product as { mergedIntoProductId?: unknown } | null)?.mergedIntoProductId);
  return merged && isValidObjectId(merged) ? merged : productId;
}

export async function getEarningsForecast(employeeId: string): Promise<EarningsForecast> {
  if (!employeeId || !isValidObjectId(employeeId)) {
    throw new Error('Neveljaven ID zaposlenega.');
  }

  // Monter je dodeljen prek DELOVNEGA NALOGA, ne prek projekta: project.assignedEmployeeIds
  // je v praksi prazen. Projekt.assignedEmployeeIds vseeno upoštevamo, če se kdaj napolni.
  const myWorkOrders = await WorkOrderModel.find({
    assignedEmployeeIds: employeeId,
    status: { $ne: 'cancelled' },
    cancelledAt: null,
  })
    .select({ projectId: 1 })
    .lean();
  const myProjectIds = Array.from(new Set(myWorkOrders.map((order) => String(order.projectId)).filter(Boolean)));

  // Potrjeno, a še ne zaračunano.
  const projects = await ProjectModel.find({
    confirmedOfferVersionId: { $ne: null },
    status: { $nin: ['invoiced', 'draft'] },
    archivedAt: null,
    $or: [{ id: { $in: myProjectIds } }, { assignedEmployeeIds: employeeId }],
  })
    .select({ id: 1, code: 1, title: 1, status: 1, 'customer.name': 1, confirmedOfferVersionId: 1, assignedEmployeeIds: 1 })
    .lean();

  // Koliko monterjev si projekt deli — prek delovnih nalogov vseh teh projektov.
  const allWorkOrders = projects.length
    ? await WorkOrderModel.find({
        projectId: { $in: projects.map((project) => project.id) },
        status: { $ne: 'cancelled' },
        cancelledAt: null,
      })
        .select({ projectId: 1, assignedEmployeeIds: 1 })
        .lean()
    : [];
  const assigneesByProject = new Map<string, Set<string>>();
  for (const order of allWorkOrders) {
    const key = String(order.projectId);
    if (!assigneesByProject.has(key)) assigneesByProject.set(key, new Set());
    for (const id of order.assignedEmployeeIds ?? []) {
      if (id) assigneesByProject.get(key)!.add(String(id));
    }
  }

  const rateCache = new Map<string, { defaultPercent: number; overridePrice: number | null } | null>();
  const getRate = async (productId: string) => {
    const rateProductId = await resolveRateProductId(productId);
    const key = `${employeeId}:${rateProductId}`;
    if (rateCache.has(key)) return rateCache.get(key) ?? null;
    const rate = isValidObjectId(rateProductId)
      ? await EmployeeServiceRateModel.findOne({ employeeId, serviceProductId: rateProductId, isActive: true }).lean()
      : null;
    const normalized = rate
      ? {
          defaultPercent: toNumber(rate.defaultPercent, 0),
          overridePrice: rate.overridePrice === null || rate.overridePrice === undefined ? null : toNumber(rate.overridePrice, 0),
        }
      : null;
    rateCache.set(key, normalized);
    return normalized;
  };

  const forecastProjects: ForecastProject[] = [];

  for (const project of projects) {
    const offer = await OfferVersionModel.findById(project.confirmedOfferVersionId).lean();
    if (!offer) continue;

    const productIds = (offer.items ?? [])
      .map((item: any) => normalizeId(item.productId))
      .filter((id: string) => id && isValidObjectId(id));
    const services = productIds.length
      ? await ProductModel.find({ _id: { $in: productIds }, isService: true }).select({ _id: 1 }).lean()
      : [];
    const serviceIds = new Set(services.map((service) => String(service._id)));

    let earnings = 0;
    const servicesWithoutRate: string[] = [];

    for (const item of offer.items ?? []) {
      const productId = normalizeId((item as any).productId);
      if (!productId || !serviceIds.has(productId)) continue;

      const rate = await getRate(productId);
      if (!rate) {
        servicesWithoutRate.push((item as any).name ?? 'Neimenovana storitev');
        continue;
      }
      const quantity = Math.max(0, toNumber((item as any).quantity, 0));
      const unitPrice = toNumber((item as any).unitPrice, 0);
      const perUnit = rate.overridePrice ?? round(unitPrice * (rate.defaultPercent / 100));
      earnings = round(earnings + perUnit * quantity);
    }

    // Delo si dodeljeni monterji razdelijo; kdo bo kaj opravil, se ve šele ob izvedbi.
    const assigned = new Set<string>(assigneesByProject.get(project.id) ?? []);
    for (const id of project.assignedEmployeeIds ?? []) {
      if (id) assigned.add(normalizeId(id));
    }
    const sharedBetween = Math.max(1, assigned.size);
    const acceptedAt = (offer as any).acceptedAt ? new Date((offer as any).acceptedAt) : null;
    const key = monthKey(acceptedAt);

    forecastProjects.push({
      projectId: project.id,
      code: project.code,
      title: project.title,
      customerName: (project as any).customer?.name ?? '',
      status: project.status,
      acceptedAt: acceptedAt ? acceptedAt.toISOString() : null,
      month: key,
      earnings: round(earnings / sharedBetween),
      sharedBetween,
      servicesWithoutRate,
    });
  }

  forecastProjects.sort((a, b) => {
    if (a.month === b.month) return a.code.localeCompare(b.code);
    if (!a.month) return 1;
    if (!b.month) return -1;
    return a.month.localeCompare(b.month);
  });

  const monthMap = new Map<string | null, ForecastMonth>();
  for (const project of forecastProjects) {
    const existing = monthMap.get(project.month);
    if (existing) {
      existing.earnings = round(existing.earnings + project.earnings);
      existing.projectCount += 1;
    } else {
      monthMap.set(project.month, {
        month: project.month,
        label: monthLabel(project.month),
        earnings: project.earnings,
        projectCount: 1,
      });
    }
  }

  return {
    employeeId,
    totalEarnings: round(forecastProjects.reduce((sum, project) => sum + project.earnings, 0)),
    projects: forecastProjects,
    months: [...monthMap.values()],
  };
}

import mongoose from 'mongoose';

import {
  MaintenancePlanModel,
  type MaintenancePlanDocument,
  type MaintenancePlanEquipment,
  type MaintenancePlanStatus,
  MAINTENANCE_PLAN_STATUSES,
} from './maintenance-plan.model';
import { ServiceTicketError, type ActorContext } from './service-ticket.service';
import { TaskModel } from '../tasks/task.model';
import { getRuleMode } from '../scheduler/wheel-config';

// AIN-P2-08 rez 2: MaintenancePlan lifecycle + izpeljava iz potrjene ponudbe +
// letni scan (maintenance.due), ki ustvari opravilo »preventivni pregled«.

export { ServiceTicketError as MaintenancePlanError };

const DEFAULT_INTERVAL_MONTHS = 12;
const DEFAULT_WARRANTY_MONTHS = 24;

function cleanString(value: unknown, maxLength = 300): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().slice(0, maxLength) : '';
}

function parseObjectId(value: unknown, field: string): mongoose.Types.ObjectId | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!mongoose.isValidObjectId(String(value))) throw new ServiceTicketError(`Neveljaven ID (${field}).`);
  return new mongoose.Types.ObjectId(String(value));
}

function parseDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new ServiceTicketError(`Neveljaven datum (${field}).`);
  return date;
}

function actorObjectId(context: ActorContext): mongoose.Types.ObjectId | undefined {
  return context.actorUserId && mongoose.isValidObjectId(context.actorUserId)
    ? new mongoose.Types.ObjectId(context.actorUserId)
    : undefined;
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

// Upsell checklist iz imen opreme (TARGET §8: starost diska, generacija kamer).
export function buildUpsellChecklist(equipment: Pick<MaintenancePlanEquipment, 'name'>[]): string[] {
  const names = equipment.map((e) => (e.name || '').toLowerCase());
  const has = (needle: string) => names.some((n) => n.includes(needle));
  const checklist: string[] = [];
  if (has('disk') || has('nvr') || has('snemal')) {
    checklist.push('Preveri starost trdega diska/snemalnika (menjava priporočena po ~3 letih).');
  }
  if (has('kamer')) {
    checklist.push('Preveri generacijo kamer — je smiselna nadgradnja na novejši model (boljša nočna slika, ločljivost)?');
  }
  if (has('alarm') || has('senzor') || has('ajax')) {
    checklist.push('Test alarmnih senzorjev + stanje baterij; predlog dodatnih senzorjev za nepokrite cone.');
  }
  checklist.push('Preveri delovanje sistema, posodobitve in oddaljeni dostop.');
  return checklist;
}

export type CreateMaintenancePlanInput = {
  client?: { id?: unknown; name?: unknown; email?: unknown };
  projectId?: unknown;
  projectMongoId?: unknown;
  offerVersionId?: unknown;
  equipment?: Array<{ productId?: unknown; name?: unknown; quantity?: unknown }>;
  intervalMonths?: unknown;
  installedAt?: unknown;
  warrantyUntil?: unknown;
  nextDueAt?: unknown;
  upsellChecklist?: unknown;
  createdByKind?: 'user' | 'system';
};

function normalizeEquipment(input: CreateMaintenancePlanInput['equipment']): MaintenancePlanEquipment[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((e) => ({
      productId: parseObjectId(e?.productId, 'equipment.productId'),
      name: cleanString(e?.name, 200),
      quantity: Math.max(0, Number(e?.quantity ?? 1)) || 1,
    }))
    .filter((e) => e.name);
}

function parseInterval(value: unknown): number {
  const n = Number(value);
  if (value === undefined || value === null || value === '') return DEFAULT_INTERVAL_MONTHS;
  if (!Number.isInteger(n) || n < 1 || n > 120) throw new ServiceTicketError('intervalMonths mora biti celo število 1–120.');
  return n;
}

export async function createMaintenancePlan(
  context: ActorContext,
  input: CreateMaintenancePlanInput,
): Promise<MaintenancePlanDocument> {
  const equipment = normalizeEquipment(input.equipment);
  if (equipment.length === 0) throw new ServiceTicketError('Načrt vzdrževanja potrebuje vsaj eno postavko opreme.');

  const intervalMonths = parseInterval(input.intervalMonths);
  const installedAt = parseDate(input.installedAt, 'installedAt');
  const nextDueAt =
    parseDate(input.nextDueAt, 'nextDueAt') ?? addMonths(installedAt ?? new Date(), intervalMonths);
  const warrantyUntil =
    parseDate(input.warrantyUntil, 'warrantyUntil') ??
    (installedAt ? addMonths(installedAt, DEFAULT_WARRANTY_MONTHS) : undefined);

  const upsellChecklist = Array.isArray(input.upsellChecklist)
    ? input.upsellChecklist.map((s) => cleanString(s, 300)).filter(Boolean)
    : buildUpsellChecklist(equipment);

  const createdByKind = input.createdByKind ?? 'user';

  return MaintenancePlanModel.create({
    tenantId: context.tenantId || 'inteligent',
    status: 'active',
    client: {
      id: parseObjectId(input.client?.id, 'client.id'),
      name: cleanString(input.client?.name, 200),
      email: cleanString(input.client?.email, 160).toLowerCase(),
    },
    projectId: cleanString(input.projectId, 40) || undefined,
    projectMongoId: parseObjectId(input.projectMongoId, 'projectMongoId'),
    offerVersionId: parseObjectId(input.offerVersionId, 'offerVersionId'),
    equipment,
    intervalMonths,
    installedAt,
    warrantyUntil,
    nextDueAt,
    upsellChecklist,
    createdBy: { kind: createdByKind, userId: createdByKind === 'user' ? actorObjectId(context) : undefined },
    history: [{ at: new Date(), byUserId: actorObjectId(context), action: 'created' }],
  });
}

// Izpelji načrt iz projekta: oprema iz potrjene ponudbe (ne-storitvene postavke),
// installedAt/warranty iz zaključka izvedbe. Idempotentno na projekt.
export async function createPlanFromProject(
  context: ActorContext,
  projectIdRaw: unknown,
  overrides: { intervalMonths?: unknown } = {},
): Promise<MaintenancePlanDocument> {
  const projectId = cleanString(projectIdRaw, 40);
  if (!projectId) throw new ServiceTicketError('projectId je obvezen.');

  const existing = await MaintenancePlanModel.findOne({ tenantId: context.tenantId, projectId });
  if (existing) return existing; // idempotentno

  const { ProjectModel } = await import('../projects/schemas/project');
  const { OfferVersionModel } = await import('../projects/schemas/offer-version');

  const project = await ProjectModel.findOne({ id: projectId }).lean();
  if (!project) throw new ServiceTicketError('Projekt ne obstaja.', 404);
  if (!project.confirmedOfferVersionId) {
    throw new ServiceTicketError('Projekt nima potrjene ponudbe — načrta ni mogoče izpeljati.', 409);
  }
  const offer = await OfferVersionModel.findOne({
    _id: project.confirmedOfferVersionId,
    projectId: project.id,
  }).lean();
  if (!offer) throw new ServiceTicketError('Potrjene ponudbe projekta ni mogoče najti.', 404);

  const equipment: MaintenancePlanEquipment[] = (offer.items ?? [])
    .filter((item: any) => item.unit !== 'storitev')
    .map((item: any) => ({
      productId: mongoose.isValidObjectId(String(item.productId)) ? new mongoose.Types.ObjectId(String(item.productId)) : undefined,
      name: cleanString(item.name, 200),
      quantity: Math.max(0, Number(item.quantity ?? 1)) || 1,
    }))
    .filter((e: MaintenancePlanEquipment) => e.name);
  if (equipment.length === 0) {
    throw new ServiceTicketError('Potrjena ponudba nima opreme (samo storitve) — načrta ni mogoče izpeljati.', 409);
  }

  const installedAt = project.closedAt ? new Date(project.closedAt) : new Date(project.createdAt);
  const intervalMonths = overrides.intervalMonths !== undefined ? parseInterval(overrides.intervalMonths) : DEFAULT_INTERVAL_MONTHS;

  return createMaintenancePlan(context, {
    client: { id: project.clientId ?? undefined, name: project.customer?.name, email: (project.customer as any)?.email },
    projectId: project.id,
    projectMongoId: String(project._id),
    offerVersionId: String(offer._id),
    equipment,
    intervalMonths,
    installedAt: installedAt.toISOString(),
    createdByKind: 'system',
  });
}

export type MaintenancePlanFilters = { status?: unknown; clientId?: unknown; projectId?: unknown; dueBefore?: unknown };

export async function listMaintenancePlans(context: ActorContext, filters: MaintenancePlanFilters = {}) {
  const query: Record<string, unknown> = { tenantId: context.tenantId };
  const status = cleanString(filters.status, 20);
  if (status) {
    if (!MAINTENANCE_PLAN_STATUSES.includes(status as MaintenancePlanStatus)) {
      throw new ServiceTicketError(`Neveljaven status. Dovoljeno: ${MAINTENANCE_PLAN_STATUSES.join(', ')}.`);
    }
    query.status = status;
  }
  const clientId = parseObjectId(filters.clientId, 'clientId');
  if (clientId) query['client.id'] = clientId;
  const projectId = cleanString(filters.projectId, 40);
  if (projectId) query.projectId = projectId;
  const dueBefore = parseDate(filters.dueBefore, 'dueBefore');
  if (dueBefore) query.nextDueAt = { $lte: dueBefore };

  return MaintenancePlanModel.find(query).sort({ nextDueAt: 1 }).limit(500).lean();
}

export async function getMaintenancePlan(context: ActorContext, idRaw: unknown): Promise<MaintenancePlanDocument> {
  const id = parseObjectId(idRaw, 'id');
  if (!id) throw new ServiceTicketError('Neveljaven ID načrta.', 404);
  const plan = await MaintenancePlanModel.findOne({ _id: id, tenantId: context.tenantId });
  if (!plan) throw new ServiceTicketError('Načrt vzdrževanja ne obstaja.', 404);
  return plan;
}

export type UpdateMaintenancePlanInput = {
  status?: unknown;
  intervalMonths?: unknown;
  nextDueAt?: unknown;
  recordVisit?: unknown; // true → zabeleži pregled: lastVisitAt=now, nextDueAt += interval
  note?: unknown;
};

export async function updateMaintenancePlan(
  context: ActorContext,
  idRaw: unknown,
  input: UpdateMaintenancePlanInput,
): Promise<MaintenancePlanDocument> {
  const plan = await getMaintenancePlan(context, idRaw);
  const byUserId = actorObjectId(context);
  const note = cleanString(input.note, 500) || undefined;
  let acted = false;

  if (input.intervalMonths !== undefined) {
    plan.intervalMonths = parseInterval(input.intervalMonths);
    acted = true;
  }

  const nextDueAt = parseDate(input.nextDueAt, 'nextDueAt');
  if (nextDueAt) {
    plan.nextDueAt = nextDueAt;
    plan.history.push({ at: new Date(), byUserId, action: 'rescheduled', note });
    acted = true;
  }

  if (input.recordVisit === true || input.recordVisit === 'true') {
    const now = new Date();
    plan.lastVisitAt = now;
    plan.nextDueAt = addMonths(now, plan.intervalMonths);
    plan.history.push({ at: now, byUserId, action: 'visit_recorded', note });
    acted = true;
  }

  if (input.status !== undefined) {
    const next = cleanString(input.status, 20) as MaintenancePlanStatus;
    if (!MAINTENANCE_PLAN_STATUSES.includes(next)) {
      throw new ServiceTicketError(`Neveljaven status. Dovoljeno: ${MAINTENANCE_PLAN_STATUSES.join(', ')}.`);
    }
    if (next !== plan.status) {
      const action = next === 'paused' ? 'paused' : next === 'active' ? 'resumed' : 'ended';
      plan.status = next;
      plan.history.push({ at: new Date(), byUserId, action, note });
    }
    acted = true;
  }

  if (!acted && note) plan.history.push({ at: new Date(), byUserId, action: 'updated', note });

  await plan.save();
  return plan;
}

export async function computeDuePlans(tenantId: string, asOf: Date = new Date()) {
  return MaintenancePlanModel.find({ tenantId, status: 'active', nextDueAt: { $lte: asOf } })
    .sort({ nextDueAt: 1 })
    .limit(200);
}

// Kolo pravilo maintenance.due (privzeto OFF): za vsak zapadel aktiven načrt ustvari
// opravilo »preventivni pregled« (z upsell checklistom) in prestavi nextDueAt naprej.
// E-mail stranki NI samodejen (Jakov princip) — pošlje se ročno iz opravila.
export async function scanDueMaintenance(now: Date = new Date(), tenantId = 'inteligent') {
  const mode = await getRuleMode('maintenance.due' as any);
  if (mode === 'off') return { skipped: 1 };

  const plans = await computeDuePlans(tenantId, now);
  let created = 0;
  for (const plan of plans) {
    const dueStamp = new Date(plan.nextDueAt).toISOString().slice(0, 10);
    const checklist = (plan.upsellChecklist ?? []).map((c) => `• ${c}`).join('\n');
    const label = `${plan.client?.name || 'stranka'}${plan.projectId ? ` (${plan.projectId})` : ''}`;
    try {
      await TaskModel.create({
        tenantId,
        type: 'maintenance.due',
        title: `Preventivni pregled — ${label}`,
        description:
          `Letni preventivni pregled vgrajene opreme.\n` +
          (plan.equipment ?? []).map((e) => `- ${e.name}${e.quantity ? ` × ${e.quantity}` : ''}`).join('\n') +
          (checklist ? `\n\nUpsell checklist:\n${checklist}` : '') +
          `\n\nPo dogovoru pošlji stranki vabilo na pregled (ročno iz opravila).`,
        subject: plan.client?.id
          ? { kind: 'client', id: plan.client.id, label }
          : { kind: 'none', label },
        assigneeRole: 'SALES',
        priority: 'normal',
        source: { kind: 'rule', ruleKey: 'maintenance.due' },
        dedupeKey: `maintenance.due:${plan._id}:${dueStamp}`,
        history: [{ at: new Date(), action: 'created', note: 'pravilo maintenance.due' }],
      });
      created += 1;
    } catch (error: any) {
      if (error?.code !== 11000) throw error; // 11000 = že ustvarjeno (idempotentno)
    }
    // Prestavi na naslednji cikel ne glede na duplikat opravila.
    plan.nextDueAt = addMonths(new Date(plan.nextDueAt), plan.intervalMonths);
    plan.history.push({ at: new Date(), action: 'generated', note: `opravilo za ${dueStamp}` });
    await plan.save();
  }
  return { scanned: plans.length, created };
}

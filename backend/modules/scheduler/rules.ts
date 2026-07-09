import mongoose from 'mongoose';

import { logger } from '../../core/logger';
import { OfferVersionModel } from '../projects/schemas/offer-version';
import { TaskModel, type TaskPriority } from '../tasks/task.model';
import { UserModel } from '../users/schemas/user';
import { WebInquiryModel, type WebInquiryDocument } from '../web-inquiries/web-inquiry.model';
import { getWheelConfig, isRuleEnabled } from './wheel-config';

// AIN-P1-11 (AINTEL_WHEEL_SPEC §3): first automation rules. A rule is a pure
// function fired on an event (called directly from the mutation site) or on a
// scheduler scan. Idempotency: every rule-created task carries a deterministic
// dedupeKey — the unique-sparse index makes double-firing harmless. Rules also
// RESOLVE tasks (offer accepted → its follow-up task auto-completes).

const PILLAR_LABELS: Record<string, string> = {
  videonadzor: 'videonadzor',
  alarm: 'alarm',
  domofon: 'domofon',
  pametni_dom: 'pametni dom',
  pametna_kljucavnica: 'pametna ključavnica',
  servis: 'servis',
};

// ── working-time helpers (Mon–Fri, workStartHour–workEndHour) ─────────────

function isWorkday(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function addWorkingHours(from: Date, hours: number, workStartHour: number, workEndHour: number): Date {
  const result = new Date(from);
  // Snap into the working window first.
  const snap = () => {
    while (!isWorkday(result) || result.getHours() >= workEndHour) {
      result.setDate(result.getDate() + 1);
      result.setHours(workStartHour, 0, 0, 0);
    }
    if (result.getHours() < workStartHour) result.setHours(workStartHour, 0, 0, 0);
  };
  snap();
  let remaining = hours;
  while (remaining > 0) {
    result.setHours(result.getHours() + 1);
    snap();
    remaining -= 1;
  }
  return result;
}

export function nextBusinessDay(from: Date, workStartHour: number): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + 1);
  result.setHours(workStartHour + 1, 0, 0, 0);
  while (!isWorkday(result)) result.setDate(result.getDate() + 1);
  return result;
}

export function businessDaysAgo(from: Date, businessDays: number): Date {
  const result = new Date(from);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    if (isWorkday(result)) remaining -= 1;
  }
  return result;
}

// ── shared task factory ────────────────────────────────────────────────────

type RuleTaskInput = {
  ruleKey: string;
  dedupeKey: string;
  type: string;
  title: string;
  description?: string;
  subject: { kind: string; id?: mongoose.Types.ObjectId; label?: string };
  assigneeRole?: string;
  assigneeEmployeeId?: mongoose.Types.ObjectId;
  priority?: TaskPriority;
  dueAt?: Date;
};

export async function ensureRuleTask(input: RuleTaskInput): Promise<'created' | 'duplicate'> {
  try {
    await TaskModel.create({
      tenantId: 'inteligent',
      type: input.type,
      title: input.title,
      description: input.description ?? '',
      subject: input.subject,
      assigneeRole: input.assigneeRole,
      assigneeEmployeeId: input.assigneeEmployeeId,
      priority: input.priority ?? 'normal',
      dueAt: input.dueAt,
      source: { kind: 'rule', ruleKey: input.ruleKey },
      dedupeKey: input.dedupeKey,
      history: [{ at: new Date(), action: 'created', note: `pravilo ${input.ruleKey}` }],
    });
    return 'created';
  } catch (error: any) {
    if (error?.code === 11000) return 'duplicate'; // dedupeKey already exists — idempotent no-op
    throw error;
  }
}

async function resolveRuleTasks(filter: Record<string, unknown>, ruleKey: string, outcome: string) {
  const tasks = await TaskModel.find({ ...filter, status: { $in: ['open', 'in_progress', 'blocked'] } });
  for (const task of tasks) {
    task.status = 'done';
    task.resolution = { outcome, note: '', resolvedByRule: ruleKey, resolvedAt: new Date() };
    task.history.push({ at: new Date(), action: 'completed', note: `pravilo ${ruleKey}: ${outcome}` });
    await task.save();
  }
  return tasks.length;
}

function inquiryLabel(inquiry: Pick<WebInquiryDocument, 'contact' | 'pillar'>) {
  const name = [inquiry.contact?.firstName, inquiry.contact?.lastName].filter(Boolean).join(' ').trim() || 'stranka';
  return `${name} — ${PILLAR_LABELS[inquiry.pillar] ?? inquiry.pillar}`;
}

// ── event rules ────────────────────────────────────────────────────────────

/**
 * inquiry.first_contact — fired right after a web inquiry is processed.
 * Auto-offer sent → "preveri ponudbo + follow-up klic" due next business day;
 * otherwise → "pokliči stranko" due +4 working hours. SALES pool.
 */
export async function onWebInquiryProcessed(inquiry: WebInquiryDocument, offerSent: boolean) {
  if (!(await isRuleEnabled('inquiry.first_contact'))) return { skipped: true as const };
  const { params } = await getWheelConfig();
  const label = inquiryLabel(inquiry);
  const subject = { kind: 'inquiry', id: inquiry._id as mongoose.Types.ObjectId, label };

  const result = offerSent
    ? await ensureRuleTask({
        ruleKey: 'inquiry.first_contact',
        dedupeKey: `inquiry.first_contact:${inquiry._id}`,
        type: 'inquiry.review_offer',
        title: `Preveri samodejno ponudbo in pokliči — ${label}`,
        description: inquiry.offerNumber ? `Poslana ponudba ${inquiry.offerNumber}.` : '',
        subject,
        assigneeRole: 'SALES',
        dueAt: nextBusinessDay(new Date(), params.workStartHour),
      })
    : await ensureRuleTask({
        ruleKey: 'inquiry.first_contact',
        dedupeKey: `inquiry.first_contact:${inquiry._id}`,
        type: 'inquiry.call',
        title: `Pokliči stranko — ${label}`,
        description: inquiry.note ? `Opomba stranke: ${inquiry.note}` : '',
        subject,
        assigneeRole: 'SALES',
        priority: 'high',
        dueAt: addWorkingHours(new Date(), 4, params.workStartHour, params.workEndHour),
      });
  return { skipped: false as const, result };
}

/**
 * inquiry.next_step — customer picked a next step on the offer result page.
 * posvet/ogled/avans → immediate task; also auto-completes the open
 * first-contact task (the customer has responded — no cold call needed).
 */
export async function onWebInquiryNextStep(inquiry: WebInquiryDocument, choice: string) {
  if (!(await isRuleEnabled('inquiry.next_step'))) return { skipped: true as const };
  const { params } = await getWheelConfig();
  const label = inquiryLabel(inquiry);
  const titles: Record<string, string> = {
    posvet: `Stranka želi POSVET — pokliči in dogovori termin: ${label}`,
    ogled: `Stranka želi OGLED — pokliči in dogovori termin: ${label}`,
    avans: `Stranka želi plačati AVANS — pošlji navodila: ${label}`,
  };
  if (!titles[choice]) return { skipped: true as const };

  const result = await ensureRuleTask({
    ruleKey: 'inquiry.next_step',
    dedupeKey: `inquiry.next_step:${inquiry._id}:${choice}`,
    type: `inquiry.${choice}`,
    title: titles[choice],
    subject: { kind: 'inquiry', id: inquiry._id as mongoose.Types.ObjectId, label },
    assigneeRole: 'SALES',
    priority: 'high',
    dueAt: addWorkingHours(new Date(), 4, params.workStartHour, params.workEndHour),
  });
  const resolved = await resolveRuleTasks(
    { 'subject.kind': 'inquiry', 'subject.id': inquiry._id, type: { $in: ['inquiry.call', 'inquiry.review_offer'] } },
    'inquiry.next_step',
    `stranka izbrala: ${choice}`,
  );
  return { skipped: false as const, result, resolved };
}

// ── scan rules (scheduler) ─────────────────────────────────────────────────

/** inquiry.stale_escalation — uncontacted inquiry older than N business days → ADMIN. */
export async function scanStaleInquiries(now = new Date()) {
  if (!(await isRuleEnabled('inquiry.stale_escalation'))) return { skipped: 1 };
  const { params } = await getWheelConfig();
  const cutoff = businessDaysAgo(now, params.inquiryStaleBusinessDays);

  const inquiries = await WebInquiryModel.find({
    status: { $in: ['novo', 'ponudba_ni_poslana', 'napaka'] },
    createdAt: { $lte: cutoff },
  })
    .sort({ createdAt: 1 })
    .limit(100);

  let created = 0;
  for (const inquiry of inquiries) {
    const contactTask = await TaskModel.findOne({
      'subject.kind': 'inquiry',
      'subject.id': inquiry._id,
      type: { $in: ['inquiry.call', 'inquiry.review_offer', 'inquiry.posvet', 'inquiry.ogled'] },
    })
      .select({ _id: 1 })
      .lean();
    if (contactTask) continue;
    const result = await ensureRuleTask({
      ruleKey: 'inquiry.stale_escalation',
      dedupeKey: `inquiry.stale_escalation:${inquiry._id}`,
      type: 'inquiry.escalation',
      title: `Povpraševanje brez kontakta > ${params.inquiryStaleBusinessDays} delovni dan — ${inquiryLabel(inquiry)}`,
      description: `Status: ${inquiry.status}. Prejeto: ${inquiry.createdAt.toLocaleString('sl-SI')}.`,
      subject: { kind: 'inquiry', id: inquiry._id as mongoose.Types.ObjectId, label: inquiryLabel(inquiry) },
      assigneeRole: 'ADMIN',
      priority: 'urgent',
    });
    if (result === 'created') created += 1;
  }
  return { scanned: inquiries.length, created };
}

async function offerAssignee(sentByUserId?: string | null) {
  if (sentByUserId && mongoose.isValidObjectId(sentByUserId)) {
    const user = await UserModel.findById(sentByUserId).select({ employeeId: 1 }).lean();
    if (user?.employeeId) return { assigneeEmployeeId: user.employeeId as mongoose.Types.ObjectId };
  }
  return { assigneeRole: 'SALES' };
}

/** offer.follow_up — offer sent N days ago and still silent → follow-up call. */
export async function scanOfferFollowUps(now = new Date()) {
  if (!(await isRuleEnabled('offer.follow_up'))) return { skipped: 1 };
  const { params } = await getWheelConfig();
  const cutoff = new Date(now.getTime() - params.offerFollowUpDays * 24 * 60 * 60 * 1000);

  const offers = await OfferVersionModel.find({ status: 'sent', sentAt: { $ne: null, $lte: cutoff } })
    .sort({ sentAt: 1 })
    .limit(200)
    .lean();

  let created = 0;
  for (const offer of offers) {
    const label = `${offer.documentNumber ?? offer.title ?? 'ponudba'} — ${offer.projectId}`;
    const result = await ensureRuleTask({
      ruleKey: 'offer.follow_up',
      dedupeKey: `offer.follow_up:${offer._id}`,
      type: 'offer.follow_up',
      title: `Follow-up klic — ponudba ${offer.documentNumber ?? ''} (${offer.projectId})`.replace('  ', ' '),
      description: `Poslana ${offer.sentAt ? new Date(offer.sentAt).toLocaleDateString('sl-SI') : ''}, brez odziva ${params.offerFollowUpDays} dni.`,
      subject: { kind: 'offerVersion', id: offer._id as mongoose.Types.ObjectId, label },
      ...(await offerAssignee(offer.sentByUserId)),
      dueAt: nextBusinessDay(now, params.workStartHour),
    });
    if (result === 'created') created += 1;
  }

  // Resolve: offers no longer 'sent' auto-complete their open follow-up task.
  const openFollowUps = await TaskModel.find({ type: 'offer.follow_up', status: { $in: ['open', 'in_progress', 'blocked'] } })
    .select({ _id: 1, 'subject.id': 1 })
    .lean();
  let resolved = 0;
  for (const task of openFollowUps) {
    if (!task.subject?.id) continue;
    const offer = await OfferVersionModel.findById(task.subject.id).select({ status: 1 }).lean();
    if (offer && offer.status !== 'sent') {
      resolved += await resolveRuleTasks({ _id: task._id }, 'offer.follow_up', `ponudba ${offer.status}`);
    }
  }
  return { scanned: offers.length, created, resolved };
}

/** offer.expiry — validUntil passed while still 'sent' → renew-or-close task. */
export async function scanOfferExpiry(now = new Date()) {
  if (!(await isRuleEnabled('offer.expiry'))) return { skipped: 1 };
  const { params } = await getWheelConfig();

  const offers = await OfferVersionModel.find({ status: 'sent', validUntil: { $ne: null, $lte: now } })
    .sort({ validUntil: 1 })
    .limit(200)
    .lean();

  let created = 0;
  for (const offer of offers) {
    const label = `${offer.documentNumber ?? offer.title ?? 'ponudba'} — ${offer.projectId}`;
    const result = await ensureRuleTask({
      ruleKey: 'offer.expiry',
      dedupeKey: `offer.expiry:${offer._id}`,
      type: 'offer.expiry',
      title: `Ponudba potekla — podaljšaj ali zapri (${offer.documentNumber ?? offer.projectId})`,
      description: `Veljavnost do ${offer.validUntil ? new Date(offer.validUntil).toLocaleDateString('sl-SI') : ''}.`,
      subject: { kind: 'offerVersion', id: offer._id as mongoose.Types.ObjectId, label },
      ...(await offerAssignee(offer.sentByUserId)),
      priority: 'high',
      dueAt: nextBusinessDay(now, params.workStartHour),
    });
    if (result === 'created') created += 1;
  }
  return { scanned: offers.length, created };
}

/** Fire-and-forget wrapper for event hooks — a rule failure must never break the business flow. */
export function fireRule(promise: Promise<unknown>, ruleKey: string) {
  promise.catch((error) => {
    logger.error({ err: error, scope: 'wheel', ruleKey }, 'Pravilo kolesa ni uspelo');
  });
}

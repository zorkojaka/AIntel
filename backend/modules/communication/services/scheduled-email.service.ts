import type { Request, Response, RequestHandler } from 'express';
import mongoose, { Schema } from 'mongoose';
import { UserModel } from '../../users/schemas/user';
import { EmployeeModel } from '../../employees/schemas/employee';
import { toCanonicalRole } from '../../../utils/roles';
import { isSchedulerEnabled } from '../../scheduler/scheduler.service';
import { logger } from '../../../core/logger';

const schema = new Schema({
  action: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'], default: 'pending' },
  params: Schema.Types.Mixed,
  body: Schema.Types.Mixed,
  tenantId: { type: String, required: true },
  actorUserId: { type: String, required: true },
  origin: String,
  sentAt: Date,
  cancelledAt: Date,
  cancelledByUserId: String,
  error: String,
}, { timestamps: true });
schema.index({ status: 1, scheduledAt: 1 });
export const ScheduledEmailModel = mongoose.models.ScheduledEmail || mongoose.model('ScheduledEmail', schema);
const handlers = new Map<string, { handler: RequestHandler; authorize?: RequestHandler }>();

export function parseScheduledAt(value: unknown, now = new Date()): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('Datum in ura pošiljanja morata vsebovati časovni pas.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= now) throw new Error('Izberite veljaven datum in uro v prihodnosti.');
  return date;
}

// Registered only on explicit mail actions, after each route's authorization.
export function withScheduledEmail(action: string, handler: RequestHandler, authorize?: RequestHandler): RequestHandler {
  handlers.set(action, { handler, authorize });
  return async (req, res, next) => {
    try {
      if (req.body?.previewOnly === true) return handler(req, res, next);
      const scheduledAt = parseScheduledAt(req.body?.scheduledAt);
      if (!scheduledAt) return handler(req, res, next);
      if (!isSchedulerEnabled()) return res.fail('Odloženo pošiljanje ni na voljo: razporejevalnik ni omogočen.', 503);
      const context = (req as any).context;
      const { scheduledAt: ignored, ...body } = req.body;
      const job = await ScheduledEmailModel.create({
        action, scheduledAt, params: req.params, body,
        tenantId: context.tenantId, actorUserId: context.actorUserId,
        origin: `${req.protocol}://${req.get('host')}`,
      });
      return res.status(202).json({ success: true, data: { scheduled: true, scheduledAt: scheduledAt.toISOString(), scheduleId: String(job._id) }, error: null });
    } catch (error) {
      return res.fail(error instanceof Error ? error.message : 'Odloženega pošiljanja ni mogoče shraniti.', 400);
    }
  };
}

export async function runScheduledEmails(now = new Date()) {
  const counts = { sent: 0, failed: 0 };
  for (let i = 0; i < 50; i++) {
    // Atomic claim prevents duplicate sends across workers. In-flight sends are
    // never automatically retried: SMTP delivery after a crash is ambiguous.
    const job = await ScheduledEmailModel.findOneAndUpdate(
      { status: 'pending', scheduledAt: { $lte: now } },
      { $set: { status: 'sending' } }, { new: true, sort: { scheduledAt: 1 } },
    );
    if (!job) break;
    try {
      const registered = handlers.get(job.action);
      if (!registered) throw new Error('Neznana vrsta odloženega sporočila.');
      const user = await UserModel.findOne({ _id: job.actorUserId, tenantId: job.tenantId, deletedAt: null });
      if (!user || (user.status ?? (user.active ? 'ACTIVE' : 'DISABLED')) !== 'ACTIVE') throw new Error('Pošiljatelj ni več aktiven.');
      const employee = user.employeeId ? await EmployeeModel.findOne({ _id: user.employeeId, tenantId: job.tenantId, deletedAt: null }) : null;
      const roles = (employee?.roles ?? user.roles ?? []).map(toCanonicalRole).filter(Boolean);
      const origin = new URL(job.origin);
      const req = {
        params: job.params, body: job.body, query: {}, protocol: origin.protocol.slice(0, -1),
        get: (key: string) => key.toLowerCase() === 'host' ? origin.host : undefined,
        context: { tenantId: job.tenantId, actorUserId: String(user._id), actorEmployeeId: employee ? String(employee._id) : null, roles },
        user: { id: String(user._id), tenantId: job.tenantId, roles },
        authUser: user, authEmployee: employee, log: logger, scheduledEmailExecution: true,
      } as unknown as Request;
      let status = 200;
      let failure: string | null = null;
      const res = {
        req,
        status(code: number) { status = code; return this; },
        json(value: any) { if (value?.success === false) failure = value.error || value.message; return this; },
        success(value: any) { if (value?.skipped || value?.sent === false || value?.message?.status === 'failed') { status = 400; failure = 'Pošiljanje ni bilo izvedeno.'; } return this; },
        fail(message: string, code = 400) { status = code; failure = message; return this; },
      } as unknown as Response;
      if (registered.authorize) {
        let allowed = false;
        await registered.authorize(req, res, () => { allowed = true; });
        if (!allowed) throw new Error(failure || 'Ni dostopa do pošiljanja.');
      }
      await registered.handler(req, res, (error?: any) => { if (error) throw error; });
      if (status >= 400 || failure) throw new Error(failure || `Pošiljanje ni uspelo (${status}).`);
      await ScheduledEmailModel.updateOne({ _id: job._id }, { $set: { status: 'sent', sentAt: new Date() } });
      counts.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ScheduledEmailModel.updateOne({ _id: job._id }, { $set: { status: 'failed', error: message.slice(0, 2000) } });
      logger.error({ err: error, scheduleId: String(job._id) }, 'Scheduled email failed');
      counts.failed++;
    }
  }
  return counts;
}

const ACTION_LABELS: Record<string, string> = {
  sendOfferCommunicationController: 'Ponudba',
  sendInvoiceCommunicationController: 'Račun',
  sendCreditNoteCommunicationController: 'Dobropis',
  sendWorkOrderConfirmationCommunicationController: 'Potrdilo delovnega naloga',
  sendInstallerPreparationCommunicationController: 'Priprava za monterja',
  supplierOrderEmailController: 'Naročilo dobavitelju',
  bookingInviteController: 'Vabilo za termin',
  'task-follow-up': 'Opravilo',
};

type Viewer = { tenantId: string; actorUserId: string; isAdmin: boolean };

// Admin sees and cancels every job; everyone else only the jobs they scheduled.
function viewerFilter(viewer: Viewer) {
  return viewer.isAdmin ? { tenantId: viewer.tenantId } : { tenantId: viewer.tenantId, actorUserId: viewer.actorUserId };
}

export async function listScheduledEmails(viewer: Viewer, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const jobs = await ScheduledEmailModel.find({
    ...viewerFilter(viewer),
    $or: [{ status: { $in: ['pending', 'sending'] } }, { scheduledAt: { $gte: since } }],
  }).sort({ scheduledAt: -1 }).limit(200).lean();
  const users = await UserModel.find({ _id: { $in: jobs.map((job: any) => job.actorUserId) } }).select({ name: 1, email: 1 }).lean();
  const names = new Map(users.map((user: any) => [String(user._id), user.name || user.email]));
  return jobs.map((job: any) => ({
    id: String(job._id),
    action: job.action,
    label: ACTION_LABELS[job.action] ?? job.action,
    projectId: job.params?.projectId ?? null,
    to: ([] as unknown[]).concat(job.body?.to ?? []).filter((value): value is string => typeof value === 'string'),
    subject: typeof job.body?.subject === 'string' ? job.body.subject : null,
    scheduledAt: job.scheduledAt,
    status: job.status,
    error: job.error ?? null,
    sentAt: job.sentAt ?? null,
    cancelledAt: job.cancelledAt ?? null,
    actorName: names.get(String(job.actorUserId)) ?? null,
  }));
}

export async function cancelScheduledEmail(id: string, viewer: Viewer) {
  if (!mongoose.isValidObjectId(id)) throw new Error('Odloženo sporočilo ni najdeno.');
  // Only a pending job can be cancelled; once claimed ('sending') the SMTP send may already be under way.
  const job = await ScheduledEmailModel.findOneAndUpdate(
    { _id: id, status: 'pending', ...viewerFilter(viewer) },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledByUserId: viewer.actorUserId } },
    { new: true },
  ).lean();
  if (!job) throw new Error('Sporočila ni več mogoče preklicati: že se pošilja, je poslano ali ni vaše.');
  return { id: String((job as any)._id), status: (job as any).status };
}

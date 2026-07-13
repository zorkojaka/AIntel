import { TaskModel } from '../tasks/task.model';
import { scanLateMaterialDeliveries, scanOfferExpiry, scanOfferFollowUps, scanStaleInquiries } from './rules';
import type { SchedulerJob } from './scheduler.service';

export async function sweepTaskSla(now = new Date()) {
  const result = await TaskModel.updateMany(
    {
      status: { $in: ['open', 'in_progress'] },
      dueAt: { $lt: now },
      slaBreachedAt: { $exists: false },
    },
    { $set: { slaBreachedAt: now } },
  );
  return { breached: result.modifiedCount ?? 0 };
}

export function schedulerJobs(): SchedulerJob[] {
  return [
    {
      key: 'tasks.sla_sweep',
      cron: '*/15 * * * *',
      async handler() {
        return { counts: await sweepTaskSla() };
      },
    },
    // AIN-P1-11: scan rules. Each is additionally gated by its own kill switch
    // in wheel_settings (ships disabled) — an enabled scheduler with all rules
    // off only runs the SLA sweep above.
    {
      key: 'rules.inquiry_stale_escalation',
      cron: '10 * * * *',
      async handler() {
        return { counts: (await scanStaleInquiries()) as Record<string, number> };
      },
    },
    {
      key: 'rules.offer_follow_up',
      cron: '25,55 * * * *',
      async handler() {
        return { counts: (await scanOfferFollowUps()) as Record<string, number> };
      },
    },
    {
      key: 'rules.offer_expiry',
      cron: '40 6 * * *',
      async handler() {
        return { counts: (await scanOfferExpiry()) as Record<string, number> };
      },
    },
    {
      key: 'rules.material_late_delivery',
      cron: '15 7 * * *',
      async handler() {
        return { counts: (await scanLateMaterialDeliveries()) as Record<string, number> };
      },
    },
    // AIN-P1-14: branje prodajnega nabiralnika (read-only IMAP). Dodatno
    // varovano s pravilom email.ingest (privzeto izklopljeno) in manjkajočo
    // IMAP konfiguracijo — brez obojega je no-op.
    {
      key: 'email.ingest',
      cron: '*/5 * * * *',
      async handler() {
        const { ingestInboundEmail } = await import('../email/email-ingest.service');
        return { counts: (await ingestInboundEmail()) as Record<string, number> };
      },
    },
    // AIN-P2-08 rez 2: letni preventivni pregled. Dodatno varovano s pravilom
    // maintenance.due (privzeto izklopljeno) — brez njega je no-op. Enkrat dnevno.
    {
      key: 'maintenance.due',
      cron: '20 7 * * *',
      async handler() {
        const { scanDueMaintenance } = await import('../service/maintenance-plan.service');
        return { counts: (await scanDueMaintenance()) as Record<string, number> };
      },
    },
  ];
}

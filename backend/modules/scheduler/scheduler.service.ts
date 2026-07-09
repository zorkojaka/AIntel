import os from 'node:os';

import { logger } from '../../core/logger';
import { captureRequestException } from '../../core/sentry';
import { SchedulerLockModel, SchedulerRunModel } from './scheduler.model';

export type SchedulerJobResult = {
  counts?: Record<string, number>;
};

export type SchedulerJob = {
  key: string;
  cron: string;
  leaseMs?: number;
  handler: () => Promise<SchedulerJobResult | void>;
};

export const DEFAULT_SCHEDULER_LEASE_MS = 10 * 60 * 1000;

export function isSchedulerEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.AINTEL_SCHEDULER_ENABLED ?? '').toLowerCase());
}

export function createSchedulerOwnerId() {
  return `${os.hostname()}:${process.pid}`;
}

export async function acquireSchedulerLock(key: string, ownerId: string, leaseMs = DEFAULT_SCHEDULER_LEASE_MS, now = new Date()) {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const acquired = await SchedulerLockModel.findOneAndUpdate(
    {
      _id: key,
      $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
    },
    {
      $set: { ownerId, leaseUntil, lastAcquiredAt: now },
      $setOnInsert: { _id: key },
    },
    { new: true },
  );

  if (acquired) return true;

  try {
    await SchedulerLockModel.create({ _id: key, ownerId, leaseUntil, lastAcquiredAt: now });
    return true;
  } catch (error: any) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

export async function releaseSchedulerLock(key: string, ownerId: string) {
  await SchedulerLockModel.deleteOne({ _id: key, ownerId });
}

export async function runSchedulerJob(job: SchedulerJob, ownerId = createSchedulerOwnerId()) {
  const acquired = await acquireSchedulerLock(job.key, ownerId, job.leaseMs);
  if (!acquired) {
    logger.debug({ jobKey: job.key, ownerId }, 'Scheduler job skipped; lock is held');
    return { skipped: true };
  }

  const startedAt = new Date();
  const run = await SchedulerRunModel.create({ key: job.key, ownerId, startedAt });

  try {
    const result = await job.handler();
    const counts = result && 'counts' in result ? result.counts ?? {} : {};
    run.finishedAt = new Date();
    run.outcome = 'success';
    run.counts = counts;
    await run.save();
    logger.info({ jobKey: job.key, ownerId, counts }, 'Scheduler job completed');
    return { skipped: false, outcome: 'success' as const, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.finishedAt = new Date();
    run.outcome = 'error';
    run.error = message.slice(0, 2000);
    await run.save();
    logger.error({ err: error, jobKey: job.key, ownerId }, 'Scheduler job failed');
    captureRequestException(
      error,
      { method: 'SCHEDULER', url: job.key, headers: {}, route: { path: `scheduler:${job.key}` } } as any,
      500,
    );
    return { skipped: false, outcome: 'error' as const, error };
  } finally {
    await releaseSchedulerLock(job.key, ownerId);
  }
}

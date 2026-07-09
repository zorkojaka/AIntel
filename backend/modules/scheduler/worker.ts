import cron, { type ScheduledTask } from 'node-cron';

import { logger } from '../../core/logger';
import { schedulerJobs } from './jobs';
import { createSchedulerOwnerId, isSchedulerEnabled, runSchedulerJob, type SchedulerJob } from './scheduler.service';

export type SchedulerWorker = {
  started: boolean;
  stop: () => void;
};

export function startSchedulerWorker(jobs: SchedulerJob[] = schedulerJobs()): SchedulerWorker {
  if (!isSchedulerEnabled()) {
    logger.info({ scope: 'scheduler' }, 'Scheduler disabled; set AINTEL_SCHEDULER_ENABLED=true to start it');
    return { started: false, stop: () => undefined };
  }

  const ownerId = createSchedulerOwnerId();
  const timezone = process.env.AINTEL_SCHEDULER_TIMEZONE || 'Europe/Ljubljana';
  const scheduled: ScheduledTask[] = [];

  for (const job of jobs) {
    const task = cron.schedule(
      job.cron,
      () => {
        void runSchedulerJob(job, ownerId);
      },
      { timezone },
    );
    scheduled.push(task);
    logger.info({ scope: 'scheduler', jobKey: job.key, cron: job.cron, timezone, ownerId }, 'Scheduler job registered');
  }

  return {
    started: true,
    stop() {
      for (const task of scheduled) {
        task.stop();
      }
      logger.info({ scope: 'scheduler', ownerId }, 'Scheduler stopped');
    },
  };
}

import { TaskModel } from '../tasks/task.model';
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
  ];
}

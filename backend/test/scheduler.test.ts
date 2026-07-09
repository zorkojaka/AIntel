import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { SchedulerLockModel, SchedulerRunModel } from '../modules/scheduler/scheduler.model';
import { acquireSchedulerLock, runSchedulerJob } from '../modules/scheduler/scheduler.service';
import { sweepTaskSla } from '../modules/scheduler/jobs';
import { TaskModel } from '../modules/tasks/task.model';

test('AIN-P1-10 scheduler locks, run logs, and SLA sweep', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'scheduler-test' });
  await SchedulerLockModel.syncIndexes();
  await SchedulerRunModel.syncIndexes();
  await TaskModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('lock lease prevents duplicate concurrent job ownership', async () => {
    const now = new Date();
    const first = await acquireSchedulerLock('test.lock', 'owner-a', 60_000, now);
    const second = await acquireSchedulerLock('test.lock', 'owner-b', 60_000, now);
    const afterExpiry = await acquireSchedulerLock('test.lock', 'owner-b', 60_000, new Date(now.getTime() + 61_000));

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(afterExpiry, true);
  });

  await t.test('runSchedulerJob records successful runs and releases the lock', async () => {
    const result = await runSchedulerJob(
      {
        key: 'test.success',
        cron: '* * * * *',
        handler: async () => ({ counts: { touched: 2 } }),
      },
      'owner-success',
    );

    const run = await SchedulerRunModel.findOne({ key: 'test.success' }).lean();
    const lock = await SchedulerLockModel.findOne({ _id: 'test.success' }).lean();

    assert.equal(result.skipped, false);
    assert.equal(run?.outcome, 'success');
    assert.equal(run?.counts?.touched, 2);
    assert.equal(lock, null);
  });

  await t.test('runSchedulerJob records failed runs', async () => {
    const result = await runSchedulerJob(
      {
        key: 'test.failure',
        cron: '* * * * *',
        handler: async () => {
          throw new Error('boom');
        },
      },
      'owner-failure',
    );

    const run = await SchedulerRunModel.findOne({ key: 'test.failure' }).lean();

    assert.equal(result.skipped, false);
    assert.equal(run?.outcome, 'error');
    assert.match(run?.error ?? '', /boom/);
  });

  await t.test('task SLA sweep marks overdue open tasks but skips blocked tasks', async () => {
    const overdue = new Date(Date.now() - 60_000);
    await TaskModel.create([
      {
        tenantId: 'inteligent',
        type: 'manual',
        title: 'Zamuja',
        subject: { kind: 'none' },
        assigneeRole: 'SALES',
        status: 'open',
        priority: 'normal',
        dueAt: overdue,
        source: { kind: 'user' },
      },
      {
        tenantId: 'inteligent',
        type: 'manual',
        title: 'Blokirano',
        subject: { kind: 'none' },
        assigneeRole: 'SALES',
        status: 'blocked',
        blockedReason: 'Čakam odgovor',
        priority: 'normal',
        dueAt: overdue,
        source: { kind: 'user' },
      },
    ]);

    const counts = await sweepTaskSla(new Date());
    const breached = await TaskModel.findOne({ title: 'Zamuja' }).lean();
    const blocked = await TaskModel.findOne({ title: 'Blokirano' }).lean();

    assert.equal(counts.breached, 1);
    assert.ok(breached?.slaBreachedAt);
    assert.equal(blocked?.slaBreachedAt, undefined);
  });
});

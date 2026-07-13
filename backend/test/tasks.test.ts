import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { TaskModel } from '../modules/tasks/task.model';
import {
  createTask,
  listMyTasks,
  listTasksBySubject,
  TaskError,
  updateTask,
  type ActorContext,
} from '../modules/tasks/task.service';

const employeeId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const sales: ActorContext = {
  tenantId: 'inteligent',
  actorUserId: String(userId),
  actorEmployeeId: String(employeeId),
  roles: ['SALES'],
};

const otherEmployee: ActorContext = {
  tenantId: 'inteligent',
  actorUserId: String(new mongoose.Types.ObjectId()),
  actorEmployeeId: String(new mongoose.Types.ObjectId()),
  roles: ['EXECUTION'],
};

test('AIN-P1-09 task module', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'tasks-test' });
  await TaskModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('create requires title and an owner', async () => {
    await assert.rejects(createTask(sales, { title: '' }), TaskError);
    // No explicit assignee: defaults to the creator's employee record …
    const selfAssigned = await createTask(sales, { title: 'Zame' });
    assert.equal(String(selfAssigned.assigneeEmployeeId), String(employeeId));
    // … but a user without an employee record must name an owner.
    const noEmployee: ActorContext = { ...sales, actorUserId: String(new mongoose.Types.ObjectId()), actorEmployeeId: null };
    await assert.rejects(createTask(noEmployee, { title: 'Brez lastnika' }), TaskError);
  });

  await t.test('create manual task for a role pool', async () => {
    const task = await createTask(sales, {
      title: 'Pokliči stranko Novak',
      assigneeRole: 'sales',
      subject: { kind: 'none' },
      dueAt: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(task.status, 'open');
    assert.equal(task.assigneeRole, 'SALES');
    assert.equal(task.type, 'manual');
    assert.equal(task.history[0]?.action, 'created');
  });

  await t.test('subject other than none requires an id', async () => {
    await assert.rejects(
      createTask(sales, { title: 'X', assigneeRole: 'SALES', subject: { kind: 'project' } }),
      /subject\.id/,
    );
  });

  await t.test('dedupeKey is idempotent (409 on repeat)', async () => {
    await createTask(sales, { title: 'Follow-up', assigneeRole: 'SALES', dedupeKey: 'offer.follow_up:abc' });
    await assert.rejects(
      createTask(sales, { title: 'Follow-up again', assigneeRole: 'SALES', dedupeKey: 'offer.follow_up:abc' }),
      (error: unknown) => error instanceof TaskError && error.statusCode === 409,
    );
  });

  await t.test('my inbox: role pool + personal, with overdue count', async () => {
    const mine = await listMyTasks(sales, {});
    assert.ok(mine.tasks.length >= 2);
    assert.ok(mine.counts.overdue >= 1); // task above is due in the past
    const foreign = await listMyTasks(otherEmployee, {});
    assert.equal(foreign.tasks.length, 0); // EXECUTION sees no SALES pool tasks
  });

  await t.test('claim moves pool task to me + in_progress; pool no longer shows it to others', async () => {
    const task = await createTask(sales, { title: 'Za prevzem', assigneeRole: 'SALES' });
    const claimed = await updateTask(sales, String(task._id), { action: 'claim' });
    assert.equal(claimed.status, 'in_progress');
    assert.equal(String(claimed.assigneeEmployeeId), String(employeeId));
    assert.equal(claimed.history[claimed.history.length - 1]?.action, 'claimed');
  });

  await t.test('complete requires resolution outcome and is terminal', async () => {
    const task = await createTask(sales, { title: 'Zaključi me', assigneeRole: 'SALES' });
    await assert.rejects(updateTask(sales, String(task._id), { action: 'complete' }), /outcome/);
    const done = await updateTask(sales, String(task._id), {
      action: 'complete',
      resolution: { outcome: 'poklicano', note: 'Stranka potrjuje termin.' },
    });
    assert.equal(done.status, 'done');
    assert.equal(done.resolution?.outcome, 'poklicano');
    await assert.rejects(updateTask(sales, String(task._id), { action: 'claim' }), /ni dovoljen/);
  });

  await t.test('block requires reason; unblock returns to owner state', async () => {
    const task = await createTask(sales, { title: 'Blokiraj me', assigneeRole: 'SALES' });
    await assert.rejects(updateTask(sales, String(task._id), { action: 'block' }), /blockedReason/);
    const blocked = await updateTask(sales, String(task._id), { action: 'block', blockedReason: 'Čakam material' });
    assert.equal(blocked.status, 'blocked');
    const unblocked = await updateTask(sales, String(task._id), { action: 'unblock' });
    assert.equal(unblocked.status, 'open'); // no personal assignee → back to pool
    assert.equal(unblocked.blockedReason, undefined);
  });

  await t.test('by-subject lists tasks of an entity', async () => {
    const projectId = new mongoose.Types.ObjectId();
    await createTask(sales, {
      title: 'Naloga projekta',
      assigneeRole: 'SALES',
      subject: { kind: 'project', id: String(projectId), label: 'PRJ-042 – Test' },
    });
    const tasks = await listTasksBySubject(sales, 'project', String(projectId));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].subject.label, 'PRJ-042 – Test');
  });

  await t.test('reassign to role pool releases in_progress back to open', async () => {
    const task = await createTask(sales, { title: 'Prerazporedi', assigneeRole: 'SALES' });
    await updateTask(sales, String(task._id), { action: 'claim' });
    const reassigned = await updateTask(sales, String(task._id), { action: 'reassign', assigneeRole: 'EXECUTION' });
    assert.equal(reassigned.assigneeRole, 'EXECUTION');
  });
});

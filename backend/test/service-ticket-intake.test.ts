import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { TaskModel } from '../modules/tasks/task.model';
import { onServiceTicketReported } from '../modules/scheduler/rules';
import { setWheelConfig, invalidateWheelConfigCache } from '../modules/scheduler/wheel-config';

test('AIN-P2-08 rez 3 service.ticket_intake wheel rule', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'service-intake-test' });
  await TaskModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  const ticket = {
    _id: new mongoose.Types.ObjectId(),
    subject: 'Kamera offline',
    description: 'Vhodna kamera ne snema.',
    priority: 'high',
    source: 'portal',
    client: { id: new mongoose.Types.ObjectId(), name: 'Novak d.o.o.' },
    contact: { phone: '040111222', email: 'novak@example.com' },
  };

  await t.test('no-op while the rule is off', async () => {
    invalidateWheelConfigCache();
    const result = await onServiceTicketReported(ticket);
    assert.deepEqual(result, { skipped: true });
    assert.equal(await TaskModel.countDocuments({ type: 'service.ticket_intake' }), 0);
  });

  await t.test('creates an EXECUTION triage task when enabled', async () => {
    await setWheelConfig({ rules: { 'service.ticket_intake': { mode: 'auto' } } });
    invalidateWheelConfigCache();

    const result = await onServiceTicketReported(ticket);
    assert.equal(result.skipped, false);

    const task = await TaskModel.findOne({ type: 'service.ticket_intake' }).lean();
    assert.ok(task, 'task created');
    assert.equal(task!.subject.kind, 'serviceTicket');
    assert.equal(String(task!.subject.id), String(ticket._id));
    assert.equal(task!.assigneeRole, 'EXECUTION');
    assert.equal(task!.priority, 'high');
    assert.ok(task!.title.includes('Novak d.o.o.'));
    assert.ok((task!.description ?? '').includes('040111222'));
  });

  await t.test('idempotent: second fire for the same ticket does not duplicate', async () => {
    const before = await TaskModel.countDocuments({ type: 'service.ticket_intake' });
    await onServiceTicketReported(ticket);
    assert.equal(await TaskModel.countDocuments({ type: 'service.ticket_intake' }), before);
  });
});

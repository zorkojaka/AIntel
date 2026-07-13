import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { TaskTemplateModel } from '../modules/tasks/task-template.model';
import {
  createTaskTemplate,
  deleteTaskTemplate,
  listTaskTemplates,
  updateTaskTemplate,
} from '../modules/tasks/task-template.service';
import { TaskError, type ActorContext } from '../modules/tasks/task.service';

const admin: ActorContext = {
  tenantId: 'inteligent',
  actorUserId: String(new mongoose.Types.ObjectId()),
  actorEmployeeId: String(new mongoose.Types.ObjectId()),
  roles: ['ADMIN'],
};

test('task templates (Nastavitve → Opravila)', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'task-templates-test' });
  await TaskTemplateModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('first list seeds default templates', async () => {
    const templates = await listTaskTemplates(admin);
    assert.ok(templates.length >= 5, 'expected seeded defaults');
    assert.ok(templates.some((template) => template.name === 'Follow-up ponudbe'));
    // Idempotent: second read must not duplicate the defaults.
    const again = await listTaskTemplates(admin);
    assert.equal(again.length, templates.length);
  });

  await t.test('create validates name, role and due offset', async () => {
    await assert.rejects(createTaskTemplate(admin, { name: '' }), TaskError);
    await assert.rejects(createTaskTemplate(admin, { name: 'X', assigneeRole: 'NEZNANA' }), TaskError);
    await assert.rejects(createTaskTemplate(admin, { name: 'X', dueInDays: 9999 }), TaskError);

    const created = await createTaskTemplate(admin, {
      name: 'Preveri kamere',
      description: 'Letni pregled sistema.',
      priority: 'high',
      dueInDays: 5,
      assigneeRole: 'execution',
    });
    assert.equal(created.title, 'Preveri kamere'); // title defaults to name
    assert.equal(created.assigneeRole, 'EXECUTION');
    assert.equal(created.dueInDays, 5);
    assert.equal(created.isActive, true);
  });

  await t.test('update, deactivate and activeOnly filter', async () => {
    const created = await createTaskTemplate(admin, { name: 'Začasna', dueInDays: 1 });
    const updated = await updateTaskTemplate(admin, String(created._id), {
      title: 'Nov naslov',
      dueInDays: null,
      isActive: false,
    });
    assert.equal(updated.title, 'Nov naslov');
    assert.equal(updated.dueInDays, undefined);
    assert.equal(updated.isActive, false);

    const active = await listTaskTemplates(admin, { activeOnly: true });
    assert.ok(!active.some((template) => String(template._id) === String(created._id)));
    const all = await listTaskTemplates(admin);
    assert.ok(all.some((template) => String(template._id) === String(created._id)));
  });

  await t.test('delete removes the template; unknown id fails', async () => {
    const created = await createTaskTemplate(admin, { name: 'Za izbris' });
    await deleteTaskTemplate(admin, String(created._id));
    await assert.rejects(deleteTaskTemplate(admin, String(created._id)), TaskError);
    await assert.rejects(updateTaskTemplate(admin, 'ni-id', { name: 'X' }), TaskError);
  });

  await t.test('tenant isolation', async () => {
    const other: ActorContext = { ...admin, tenantId: 'drugo-podjetje' };
    const created = await createTaskTemplate(admin, { name: 'Samo inteligent' });
    await assert.rejects(updateTaskTemplate(other, String(created._id), { name: 'Ugrabljena' }), TaskError);
    await assert.rejects(deleteTaskTemplate(other, String(created._id)), TaskError);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { MaintenancePlanModel } from '../modules/service/maintenance-plan.model';
import {
  createMaintenancePlan,
  createPlanFromProject,
  listMaintenancePlans,
  getMaintenancePlan,
  updateMaintenancePlan,
  computeDuePlans,
  scanDueMaintenance,
  buildUpsellChecklist,
  addMonths,
  MaintenancePlanError,
} from '../modules/service/maintenance-plan.service';
import type { ActorContext } from '../modules/service/service-ticket.service';
import { TaskModel } from '../modules/tasks/task.model';
import { setWheelConfig, invalidateWheelConfigCache } from '../modules/scheduler/wheel-config';

const admin: ActorContext = {
  tenantId: 'inteligent',
  actorUserId: String(new mongoose.Types.ObjectId()),
  actorEmployeeId: String(new mongoose.Types.ObjectId()),
  roles: ['ADMIN'],
};

test('AIN-P2-08 rez 2 maintenance plans', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'maintenance-plan-test' });
  await MaintenancePlanModel.syncIndexes();
  await TaskModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('upsell checklist reflects equipment', () => {
    const list = buildUpsellChecklist([{ name: 'IP kamera 4MP' }, { name: 'Snemalnik NVR 8ch' }]);
    assert.ok(list.some((l) => /disk|snemal/i.test(l)));
    assert.ok(list.some((l) => /kamer/i.test(l)));
    assert.ok(list.some((l) => /delovanje/i.test(l)));
  });

  await t.test('create requires equipment and computes defaults', async () => {
    await assert.rejects(createMaintenancePlan(admin, { equipment: [] }), MaintenancePlanError);
    const installedAt = new Date('2026-01-15T00:00:00Z');
    const plan = await createMaintenancePlan(admin, {
      client: { name: 'Test d.o.o.' },
      equipment: [{ name: 'Kamera', quantity: 4 }, { name: 'Trdi disk 2TB', quantity: 1 }],
      installedAt: installedAt.toISOString(),
    });
    assert.equal(plan.status, 'active');
    assert.equal(plan.intervalMonths, 12);
    // nextDueAt = installedAt + 12 mesecev; warranty = installedAt + 24 mesecev
    assert.equal(plan.nextDueAt.getTime(), addMonths(installedAt, 12).getTime());
    assert.equal(plan.warrantyUntil?.getTime(), addMonths(installedAt, 24).getTime());
    assert.ok(plan.upsellChecklist.length >= 2);
  });

  await t.test('invalid interval is rejected', async () => {
    await assert.rejects(
      createMaintenancePlan(admin, { equipment: [{ name: 'X' }], intervalMonths: 0 }),
      MaintenancePlanError,
    );
  });

  await t.test('recordVisit advances next due date by interval', async () => {
    const plan = await createMaintenancePlan(admin, { equipment: [{ name: 'Alarm Ajax' }], intervalMonths: 12 });
    const before = plan.nextDueAt.getTime();
    const updated = await updateMaintenancePlan(admin, plan.id, { recordVisit: true });
    assert.ok(updated.lastVisitAt instanceof Date);
    assert.ok(updated.nextDueAt.getTime() > before);
    assert.equal(updated.history.at(-1)?.action, 'visit_recorded');
  });

  await t.test('pause and end transitions record history', async () => {
    const plan = await createMaintenancePlan(admin, { equipment: [{ name: 'Kamera' }] });
    const paused = await updateMaintenancePlan(admin, plan.id, { status: 'paused' });
    assert.equal(paused.status, 'paused');
    assert.equal(paused.history.at(-1)?.action, 'paused');
    const ended = await updateMaintenancePlan(admin, plan.id, { status: 'ended' });
    assert.equal(ended.status, 'ended');
  });

  await t.test('duplicate plan for the same project is rejected (idempotency guard)', async () => {
    await createMaintenancePlan(admin, { equipment: [{ name: 'Kamera' }], projectId: 'PRJ-900' });
    await assert.rejects(
      createMaintenancePlan(admin, { equipment: [{ name: 'Kamera' }], projectId: 'PRJ-900' }),
      (err: any) => err?.code === 11000 || err instanceof MaintenancePlanError,
    );
  });

  await t.test('createPlanFromProject derives equipment from confirmed offer', async () => {
    const offerId = new mongoose.Types.ObjectId();
    const projectMongoId = new mongoose.Types.ObjectId();
    const clientId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('projects').insertOne({
      _id: projectMongoId,
      id: 'PRJ-500',
      clientId,
      customer: { name: 'Stranka Ena', email: 'stranka@example.com' },
      status: 'completed',
      confirmedOfferVersionId: offerId.toString(),
      closedAt: new Date('2026-03-01T00:00:00Z'),
      createdAt: '2026-02-01T00:00:00Z',
    });
    await mongoose.connection.collection('offerversions').insertOne({
      _id: offerId,
      projectId: 'PRJ-500',
      items: [
        { name: 'IP kamera 4MP', quantity: 3, unit: 'kos', productId: null },
        { name: 'Montaža in zagon', quantity: 1, unit: 'storitev', productId: null },
        { name: 'Snemalnik NVR', quantity: 1, unit: 'kos', productId: null },
      ],
    });

    const plan = await createPlanFromProject(admin, 'PRJ-500');
    assert.equal(plan.projectId, 'PRJ-500');
    assert.equal(plan.equipment.length, 2); // storitev izločena
    assert.ok(plan.equipment.every((e) => e.name !== 'Montaža in zagon'));
    assert.equal(plan.installedAt?.getTime(), new Date('2026-03-01T00:00:00Z').getTime());
    assert.equal(plan.createdBy.kind, 'system');

    // Idempotentno: drugi klic vrne isti načrt.
    const again = await createPlanFromProject(admin, 'PRJ-500');
    assert.equal(String(again._id), String(plan._id));
  });

  await t.test('from-project rejects project without confirmed offer', async () => {
    await mongoose.connection.collection('projects').insertOne({
      _id: new mongoose.Types.ObjectId(),
      id: 'PRJ-501',
      customer: { name: 'Brez ponudbe' },
      status: 'offered',
      createdAt: '2026-02-01T00:00:00Z',
    });
    await assert.rejects(createPlanFromProject(admin, 'PRJ-501'), (err: any) => err.statusCode === 409);
    await assert.rejects(createPlanFromProject(admin, 'PRJ-NEOBSTAJA'), (err: any) => err.statusCode === 404);
  });

  await t.test('scanDueMaintenance is a no-op while the rule is off', async () => {
    invalidateWheelConfigCache();
    const result = await scanDueMaintenance(new Date());
    assert.deepEqual(result, { skipped: 1 });
  });

  await t.test('scanDueMaintenance creates tasks for due plans and advances schedule (rule=auto)', async () => {
    await setWheelConfig({ rules: { 'maintenance.due': { mode: 'auto' } } });
    invalidateWheelConfigCache();

    const due = await createMaintenancePlan(admin, {
      client: { id: new mongoose.Types.ObjectId(), name: 'Zapadli' },
      projectId: 'PRJ-DUE-1',
      equipment: [{ name: 'Kamera' }, { name: 'Disk' }],
      nextDueAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // včeraj
    });
    const dueBefore = due.nextDueAt.getTime();

    const result = await scanDueMaintenance(new Date());
    assert.ok((result.created ?? 0) >= 1, 'expected a task created');

    const tasks = await TaskModel.find({ type: 'maintenance.due' }).lean();
    assert.ok(tasks.some((tk) => tk.title.includes('Zapadli')));
    assert.ok(tasks.some((tk) => (tk.description ?? '').includes('Upsell checklist')));

    const refreshed = await MaintenancePlanModel.findById(due._id).lean();
    assert.ok(refreshed!.nextDueAt.getTime() > dueBefore, 'nextDueAt advanced');

    // Idempotentno: takojšen ponovni scan ne podvoji opravila za isti dueStamp.
    const taskCountBefore = await TaskModel.countDocuments({ type: 'maintenance.due' });
    // Vrni načrt spet v zapadlost, a z ISTIM dueStamp kot prej ne bi šlo — zato
    // preverimo, da drugi scan brez novih zapadlih ne ustvari nič.
    const second = await scanDueMaintenance(new Date());
    assert.equal(second.created ?? 0, 0);
    assert.equal(await TaskModel.countDocuments({ type: 'maintenance.due' }), taskCountBefore);
  });

  await t.test('computeDuePlans + list/get tenant isolation', async () => {
    const other: ActorContext = { ...admin, tenantId: 'druga-firma' };
    const foreign = await createMaintenancePlan(other, { equipment: [{ name: 'Tuja kamera' }] });
    const mine = await listMaintenancePlans(admin, {});
    assert.ok(mine.every((p) => p.tenantId === 'inteligent'));
    await assert.rejects(getMaintenancePlan(admin, foreign.id), (err: any) => err.statusCode === 404);
    const due = await computeDuePlans('inteligent', new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000));
    assert.ok(due.every((p) => p.tenantId === 'inteligent' && p.status === 'active'));
  });
});

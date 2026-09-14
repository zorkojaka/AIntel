import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getInternalNotificationOptions, getInternalNotificationSettings, saveInternalNotificationSettings, resolveInternalNotificationRecipients } from '../modules/communication/services/internal-notification-settings.service';
import * as notifications from '../modules/communication/services/internal-notification.service';
import * as communication from '../modules/communication/services/communication.service';
import * as invoice from '../modules/projects/services/invoice.service';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { UserModel } from '../modules/users/schemas/user';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { ConfigStoreModel } from '../modules/settings/config/config-store.model';
import { _clearConfigCache } from '../modules/settings/config/config-store.service';
import { registerCoreConfigNamespaces } from '../modules/settings/config/config-namespaces';
import { updateSettings } from '../modules/settings/settings.service';
import { applyAutomaticPreparationProgression, updateWorkOrder } from '../modules/projects/controllers/logistics.controller';

let mongo: MongoMemoryServer;
test.before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); registerCoreConfigNamespaces(); });
test.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
test.beforeEach(async () => {
  await Promise.all([ProjectModel.deleteMany({}), WorkOrderModel.deleteMany({}), UserModel.deleteMany({}), EmployeeModel.deleteMany({}), ConfigStoreModel.deleteMany({})]);
  _clearConfigCache();
  await updateSettings({ phaseProgressionMode: 'manual', workOrderCompletionSignatureMode: 'optional' });
});

test('privzete izbire po vlogah; shranjevanje in validacija sta na backendu', async () => {
  const options = await getInternalNotificationOptions();
  assert.deepEqual(options.value.EXECUTION, { issued: true, scheduled: true });
  assert.deepEqual(options.value.SALES, { scheduled: true, completed: true });
  assert.deepEqual(options.value.ADMIN, { issued: true, scheduled: true, completed: true });
  const edited = { ...options.value, EXECUTION: { issued: false, scheduled: false }, ADMIN: { issued: false, scheduled: true, completed: false } };
  await saveInternalNotificationSettings(edited, 'test-admin');
  _clearConfigCache();
  assert.deepEqual(await getInternalNotificationSettings(), edited);
  assert.equal((await ConfigStoreModel.findOne({ namespace: 'communication.internal' }))?.updatedBy, 'test-admin');
  await assert.rejects(saveInternalNotificationSettings({ ADMIN: { issued: 'invalid' } }), /logična/);
});

test('vloge upoštevajo odgovornega prodajalca, izklop, aktivnost in tenant', async () => {
  const sales = await UserModel.create({ tenantId: 'inteligent', email: 'sales@example.com', roles: ['SALES'] });
  await UserModel.create({ tenantId: 'inteligent', email: 'other-sales@example.com', roles: ['SALES'] });
  await UserModel.create({ tenantId: 'inteligent', email: 'admin@example.com', roles: ['ADMIN', 'FINANCE'] });
  await UserModel.create({ tenantId: 'inteligent', email: 'finance@example.com', roles: ['FINANCE'] });
  await UserModel.create({ tenantId: 'inteligent', email: 'disabled@example.com', roles: ['ADMIN'], active: false });
  await UserModel.create({ tenantId: 'other', email: 'other@example.com', roles: ['ADMIN'] });
  assert.deepEqual((await resolveInternalNotificationRecipients('completed', sales._id)).sort(), ['admin@example.com', 'sales@example.com']);
  const settings = await getInternalNotificationSettings();
  await saveInternalNotificationSettings({ ...settings, SALES: { scheduled: false, completed: false }, FINANCE: { completed: true } });
  assert.deepEqual((await resolveInternalNotificationRecipients('completed', sales._id)).sort(), ['admin@example.com', 'finance@example.com']);
  assert.deepEqual(await resolveInternalNotificationRecipients('issued', sales._id), ['admin@example.com']);
});

async function order() {
  await ProjectModel.create({ id: 'PRJ-990', code: 'PRJ-990', projectNumber: 990, title: 'Test', customer: { name: 'Stranka' }, status: 'ordered', createdAt: new Date().toISOString() });
  return WorkOrderModel.create({ projectId: 'PRJ-990', offerVersionId: new mongoose.Types.ObjectId().toString(), status: 'draft', items: [] });
}

test('izklop monterja ustavi avtomatsko pošiljanje PDF; druge vloge ostanejo neodvisne', async (t) => {
  const wo = await order();
  const settings = await getInternalNotificationSettings();
  await saveInternalNotificationSettings({ ...settings, EXECUTION: { issued: false, scheduled: false } });
  const installer = t.mock.method(communication, 'sendInstallerPreparationEmail', async () => ({ sent: true, recipients: [] }));
  const general = t.mock.method(communication, 'sendBookingSelectedInternalEmail', async () => ({ skipped: true }));
  await notifications.notifyInternalWorkOrderEvent({ projectId: wo.projectId, workOrderId: String(wo._id), event: 'issued' });
  assert.equal(installer.mock.callCount(), 0);
  assert.equal(general.mock.callCount(), 1);
  assert.equal(general.mock.calls[0].arguments[0].event, 'issued');
});

test('monter dobi obstoječi PDF email; več vlog ne podvoji istega prejemnika', async (t) => {
  const wo = await order();
  const installer = t.mock.method(communication, 'sendInstallerPreparationEmail', async () => ({ sent: true, recipients: ['installer-admin@example.com'] }));
  const general = t.mock.method(communication, 'sendBookingSelectedInternalEmail', async () => ({ skipped: true }));
  await notifications.notifyInternalWorkOrderEvent({ projectId: wo.projectId, workOrderId: String(wo._id), event: 'scheduled', customerSelected: true, baseUrl: 'https://example.com' });
  assert.equal(installer.mock.callCount(), 1);
  assert.equal(installer.mock.calls[0].arguments[0].confirmSend, true);
  assert.deepEqual(general.mock.calls[0].arguments[0].excludeRecipients, ['installer-admin@example.com']);
  assert.equal(general.mock.calls[0].arguments[0].customerSelected, true);
});

test('napaka emaila monterju ne prepreči obvestila drugim in se zabeleži', async (t) => {
  const wo = await order();
  t.mock.method(communication, 'sendInstallerPreparationEmail', async () => { throw new Error('Testna napaka monter'); });
  const general = t.mock.method(communication, 'sendBookingSelectedInternalEmail', async () => ({ skipped: true }));
  await notifications.notifyInternalWorkOrderEvent({ projectId: wo.projectId, workOrderId: String(wo._id), event: 'issued', baseUrl: 'https://example.com' });
  assert.equal(general.mock.callCount(), 1);
  assert.ok((await ProjectModel.findOne({ id: wo.projectId }))?.timeline.some((entry) => entry.description === 'Testna napaka monter'));
});

async function update(wo: any, body: unknown) {
  let failure: unknown;
  const req = { params: { projectId: wo.projectId, workOrderId: String(wo._id) }, body,
    context: { tenantId: 'inteligent', roles: ['ADMIN'] }, user: { roles: ['ADMIN'] },
    protocol: 'https', get: () => 'example.com' };
  await updateWorkOrder(req as any, { success: () => {}, fail: (message: string) => { failure = new Error(message); } } as any, (error) => { failure = error; });
  if (failure) throw failure;
}

test('ročni termin in izdaja sprožita obvestilo samo ob spremembi', async (t) => {
  const wo = await order();
  const notify = t.mock.method(notifications, 'notifyInternalWorkOrderEvent', async () => {});
  await update(wo, { scheduledAt: '2026-09-15T09:00:00' });
  await update(wo, { scheduledAt: '2026-09-15T09:00:00' });
  await update(wo, { status: 'issued' });
  await update(wo, { status: 'issued' });
  assert.deepEqual(notify.mock.calls.map((call) => call.arguments[0].event), ['scheduled', 'issued']);
});

test('zaključek sproži obvestilo prodaji samo ob prehodu v zaključen nalog', async (t) => {
  const wo = await order();
  const notify = t.mock.method(notifications, 'notifyInternalWorkOrderEvent', async () => {});
  t.mock.method(invoice, 'createInvoiceFromClosing', async () => null);
  await update(wo, { status: 'completed' });
  await update(wo, { status: 'completed' });
  assert.deepEqual(notify.mock.calls.map((call) => call.arguments[0].event), ['completed']);
});

test('samodejna izdaja brez HTTP zahteve prav tako sproži obvestilo', async (t) => {
  const wo = await order();
  const employee = await EmployeeModel.create({ tenantId: 'inteligent', name: 'Monter', roles: ['EXECUTION'] });
  wo.assignedEmployeeIds = [employee._id]; wo.scheduledAt = '2026-09-15T09:00:00'; wo.scheduledConfirmedAt = new Date(); await wo.save();
  await updateSettings({ phaseProgressionMode: 'automatic' });
  const notify = t.mock.method(notifications, 'notifyInternalWorkOrderEvent', async () => {});
  assert.equal(await applyAutomaticPreparationProgression(wo.projectId, String(wo._id)), true);
  await applyAutomaticPreparationProgression(wo.projectId, String(wo._id));
  assert.equal(notify.mock.callCount(), 1);
  assert.equal(notify.mock.calls[0].arguments[0].event, 'issued');
});

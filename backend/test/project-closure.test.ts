import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { listProjects, updateProjectLifecycle } from '../modules/projects/controllers/project.controller';
import { getBookingByToken } from '../modules/availability/booking.service';

let mongo: MongoMemoryServer;
test.before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
test.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
test.beforeEach(async () => { await Promise.all([ProjectModel.deleteMany({}), WorkOrderModel.deleteMany({})]); });
function response() {
  const result = { status: 0, data: undefined as any, error: '' };
  return { result, res: {
    success(data: any) { result.status = 200; result.data = data; },
    fail(error: string, status: number) { result.status = status; result.error = error; },
  } };
}
async function project(number = 991, extra: Record<string, unknown> = {}) {
  return ProjectModel.create({ id: `PRJ-${number}`, code: `PRJ-${number}`, projectNumber: number,
    title: `Projekt ${number}`, customer: { name: 'Stranka' }, status: 'offered', createdAt: new Date().toISOString(), ...extra });
}
async function lifecycle(id: string, action: string, reason?: unknown) {
  const { res, result } = response();
  await updateProjectLifecycle({ params: { id }, body: { action, reason },
    context: { actorUserId: 'user-123' }, authEmployee: { name: 'Žiga Test' } } as any, res as any);
  return result;
}
async function list(view: string) {
  const { res, result } = response();
  await listProjects({ query: { view }, context: { roles: ['ADMIN'] } } as any, res as any);
  return result.data as any[];
}

test('zavrnitev shrani razlog, uporabnika in čas ter premakne projekt v arhiv', async () => {
  const p = await project();
  const result = await lifecycle(p.id, 'reject', '  Stranka ne želi izvedbe.  ');
  assert.equal(result.status, 200);
  assert.equal(result.data.closureOutcome, 'rejected');
  assert.equal(result.data.closureReason, 'Stranka ne želi izvedbe.');
  assert.equal(result.data.closedBy, 'Žiga Test');
  assert.equal(result.data.closedByUserId, 'user-123');
  assert.ok(result.data.closedAt);
  assert.ok(result.data.archivedAt);
  assert.equal((await list('active')).length, 0);
  const archived = await list('archived');
  assert.equal(archived.length, 1);
  assert.equal(archived[0].closureOutcome, 'rejected');
  assert.equal(archived[0].closedBy, 'Žiga Test');
  assert.equal((await list('closed')).length, 0);
});

test('ponovitev zavrnitve ne prepiše prvotnega razloga, avtorja ali časa', async () => {
  const p = await project();
  const first = await lifecycle(p.id, 'reject', 'Prvotni razlog');
  const second = await lifecycle(p.id, 'reject', 'Drug razlog');
  assert.equal(second.data.closureReason, 'Prvotni razlog');
  assert.equal(new Date(second.data.closedAt).valueOf(), new Date(first.data.closedAt).valueOf());
  assert.equal(second.data.timeline.filter((e: any) => e.title === 'Projekt zavrnjen').length, 1);
});

test('razlog je neobvezen, neveljaven ali predolg pa se zavrne brez zaprtja', async () => {
  const p = await project();
  assert.equal((await lifecycle(p.id, 'reject', {})).status, 400);
  assert.equal((await lifecycle(p.id, 'reject', 'a'.repeat(2001))).status, 400);
  assert.equal((await ProjectModel.findOne({ id: p.id }))?.closedAt, null);
  assert.equal((await lifecycle(p.id, 'reject')).data.closureReason, null);
});

test('ponovno odprtje vrne projekt med aktivne in ohrani dnevnik zavrnitve', async () => {
  const p = await project();
  await lifecycle(p.id, 'reject', 'Previsoka cena');
  assert.equal((await lifecycle(p.id, 'unarchive')).status, 400);
  const reopened = await lifecycle(p.id, 'reopen');
  assert.equal(reopened.data.closedAt, null);
  assert.equal(reopened.data.archivedAt, null);
  assert.equal(reopened.data.closureOutcome, null);
  assert.ok(reopened.data.timeline.some((entry: any) => entry.title === 'Projekt zavrnjen' && entry.description === 'Previsoka cena'));
  assert.equal((await list('active')).length, 1);
  assert.equal((await list('archived')).length, 0);
});

test('arhiv vsebuje tudi prej zaključene projekte; zaključevanje ohrani pogoj izdanega računa', async () => {
  const p = await project();
  assert.equal((await lifecycle(p.id, 'close')).status, 400);
  const invoiced = await project(992, { status: 'invoiced' });
  assert.equal((await lifecycle(invoiced.id, 'reject')).status, 400);
  assert.equal((await lifecycle(invoiced.id, 'close', 'Uspešno opravljeno')).status, 200);
  await project(993, { closedAt: new Date(), closedBy: 'Prejšnji uporabnik' });
  assert.equal((await list('archived')).length, 2);
  assert.equal((await list('closed')).length, 2);
});

test('povezava za termin zaprtega projekta ne omogoča nove izbire', async () => {
  const p = await project();
  const token = 'f'.repeat(48);
  await WorkOrderModel.create({ projectId: p.id, offerVersionId: new mongoose.Types.ObjectId().toString(), bookingToken: token });
  await lifecycle(p.id, 'reject');
  await assert.rejects(getBookingByToken(token), /Projekt je zaprt/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { parseScheduledAt, runScheduledEmails, ScheduledEmailModel, withScheduledEmail } from '../modules/communication/services/scheduled-email.service';
import { UserModel } from '../modules/users/schemas/user';
import { requireRoles } from '../middlewares/auth';

function response() {
  return {
    code: 200, payload: null as any,
    status(code: number) { this.code = code; return this; },
    json(payload: any) { this.payload = payload; return this; },
    success(data: any) { this.payload = { success: true, data }; return this; },
    fail(error: string, code = 400) { this.code = code; this.payload = { success: false, error }; return this; },
  };
}

test('scheduled time requires a future instant with a timezone', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  assert.equal(parseScheduledAt(undefined, now), null);
  assert.equal(parseScheduledAt('2026-10-16T14:00:00+02:00', now)?.toISOString(), '2026-10-16T12:00:00.000Z');
  for (const value of ['2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z', '2026-10-17T14:00', 'invalid', 123]) {
    assert.throws(() => parseScheduledAt(value, now));
  }
});

test('persistent scheduled emails: enqueue, claim, permissions and failures', async (t) => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const oldEnabled = process.env.AINTEL_SCHEDULER_ENABLED;
  process.env.AINTEL_SCHEDULER_ENABLED = 'true';
  t.after(async () => {
    if (oldEnabled === undefined) delete process.env.AINTEL_SCHEDULER_ENABLED;
    else process.env.AINTEL_SCHEDULER_ENABLED = oldEnabled;
    await mongoose.disconnect();
    await mongo.stop();
  });
  const user = await UserModel.create({ email: 'scheduled@example.test', tenantId: 'inteligent', roles: ['SALES'] });
  let sends = 0;
  const handler = withScheduledEmail('test.send', async (req, res) => {
    if (req.body.previewOnly) return res.success({ preview: true });
    sends++;
    assert.equal(req.body.scheduledAt, undefined);
    return res.success({ sent: true });
  }, requireRoles(['SALES']));
  const future = new Date(Date.now() + 3600000);
  const req = (body: any) => ({
    body, params: { projectId: 'p1' }, protocol: 'https', get: () => 'aintel.example.test',
    context: { tenantId: 'inteligent', actorUserId: String(user._id) },
  } as any);
  const enqueue = async (action = handler) => {
    const res = response();
    await action(req({ scheduledAt: future.toISOString(), to: 'client@example.test', subject: 'Test', body: 'Body' }), res as any, () => {});
    assert.equal(res.code, 202);
    assert.equal(res.payload.data.scheduled, true);
    return res.payload.data.scheduleId;
  };

  const id = await enqueue();
  assert.equal(sends, 0);
  assert.equal(await ScheduledEmailModel.countDocuments({ status: 'pending' }), 1);
  assert.deepEqual(await runScheduledEmails(), { sent: 0, failed: 0 });
  await Promise.all([runScheduledEmails(future), runScheduledEmails(future)]);
  assert.equal(sends, 1);
  assert.equal((await ScheduledEmailModel.findById(id))?.status, 'sent');

  const deniedId = await enqueue();
  await UserModel.updateOne({ _id: user._id }, { $set: { roles: [] } });
  assert.deepEqual(await runScheduledEmails(future), { sent: 0, failed: 1 });
  assert.equal(sends, 1);
  assert.equal((await ScheduledEmailModel.findById(deniedId))?.status, 'failed');
  await UserModel.updateOne({ _id: user._id }, { $set: { roles: ['SALES'] } });

  const failing = withScheduledEmail('test.failure', async (_req, res) => res.fail('SMTP unavailable', 502));
  const failedId = await enqueue(failing);
  assert.deepEqual(await runScheduledEmails(future), { sent: 0, failed: 1 });
  assert.equal((await ScheduledEmailModel.findById(failedId))?.error, 'SMTP unavailable');
  assert.deepEqual(await runScheduledEmails(future), { sent: 0, failed: 0 });

  const preview = response();
  await handler(req({ previewOnly: true, scheduledAt: future.toISOString() }), preview as any, () => {});
  assert.equal(preview.payload.data.preview, true);
  assert.equal(sends, 1);

  process.env.AINTEL_SCHEDULER_ENABLED = 'false';
  const disabled = response();
  await handler(req({ scheduledAt: future.toISOString() }), disabled as any, () => {});
  assert.equal(disabled.code, 503);
});

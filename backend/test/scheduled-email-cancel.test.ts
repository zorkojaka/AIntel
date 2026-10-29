import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  cancelScheduledEmail, listScheduledEmails, runScheduledEmails, ScheduledEmailModel, withScheduledEmail,
} from '../modules/communication/services/scheduled-email.service';
import { UserModel } from '../modules/users/schemas/user';

test('odloženo sporočilo: seznam po pošiljatelju, preklic le dokler čaka', async (t) => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  t.after(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const sales = await UserModel.create({ email: 'prodaja@example.test', name: 'Prodaja', tenantId: 'inteligent', roles: ['SALES'], status: 'ACTIVE' });
  const other = await UserModel.create({ email: 'drugi@example.test', tenantId: 'inteligent', roles: ['SALES'], status: 'ACTIVE' });
  let sends = 0;
  withScheduledEmail('cancel.test', async (_req, res) => { sends++; return res.success({ sent: true }); });
  const job = (actor: string, minutes: number) => ScheduledEmailModel.create({
    action: 'cancel.test', scheduledAt: new Date(Date.now() + minutes * 60000), params: { projectId: 'PRJ-1' },
    body: { to: ['stranka@example.test'], subject: 'Ponudba' }, tenantId: 'inteligent', actorUserId: actor, origin: 'https://a.test',
  });
  const mine = await job(String(sales._id), 60);
  const theirs = await job(String(other._id), 60);

  const asSales = { tenantId: 'inteligent', actorUserId: String(sales._id), isAdmin: false };
  const asAdmin = { tenantId: 'inteligent', actorUserId: 'admin', isAdmin: true };
  const listed = await listScheduledEmails(asSales);
  assert.deepEqual(listed.map((entry) => entry.id), [String(mine._id)]);
  assert.equal(listed[0].actorName, 'Prodaja');
  assert.deepEqual(listed[0].to, ['stranka@example.test']);
  assert.equal((await listScheduledEmails(asAdmin)).length, 2);

  // Tujega ne more preklicati, svojega lahko, dvakrat ne.
  await assert.rejects(cancelScheduledEmail(String(theirs._id), asSales));
  assert.equal((await cancelScheduledEmail(String(mine._id), asSales)).status, 'cancelled');
  await assert.rejects(cancelScheduledEmail(String(mine._id), asSales));

  // Preklicano se ob uri ne pošlje; ko se pošiljanje začne, preklic ni več mogoč.
  await runScheduledEmails(new Date(Date.now() + 2 * 3600000));
  assert.equal(sends, 1);
  assert.equal((await ScheduledEmailModel.findById(mine._id).lean() as any).status, 'cancelled');
  await assert.rejects(cancelScheduledEmail(String(theirs._id), asAdmin));
});

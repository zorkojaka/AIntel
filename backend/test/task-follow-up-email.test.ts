import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CommunicationTemplateModel } from '../modules/communication/schemas/template';
import { CommunicationSenderSettingsModel } from '../modules/communication/schemas/sender-settings';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';
import { previewOfferFollowUpEmail, sendOfferFollowUpEmail } from '../modules/tasks/follow-up-email.service';
import { TaskModel } from '../modules/tasks/task.model';
import type { ActorContext } from '../modules/tasks/task.service';

const actor: ActorContext = {
  tenantId: 'inteligent',
  actorUserId: String(new mongoose.Types.ObjectId()),
  actorEmployeeId: String(new mongoose.Types.ObjectId()),
  roles: ['SALES'],
};

async function makeFollowUpTask() {
  const client = await CrmClientModel.create({
    name: 'Janez Novak',
    type: 'individual',
    email: 'janez@example.com',
    tags: [],
  });
  const project = await ProjectModel.create({
    id: 'PRJ-FOLLOW-1',
    code: 'PRJ-FOLLOW-1',
    projectNumber: 93001,
    clientId: client._id,
    title: 'Alarm hiša',
    customer: { name: 'Janez Novak' },
    status: 'offered',
    createdAt: new Date().toISOString(),
  });
  const offer = await OfferVersionModel.create({
    projectId: project.id,
    baseTitle: 'Ponudba',
    versionNumber: 1,
    title: 'Ponudba v1',
    documentNumber: 'PON-93001',
    status: 'sent',
    sentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    totalWithVat: 1234.56,
    items: [],
  });
  const task = await TaskModel.create({
    tenantId: 'inteligent',
    type: 'offer.follow_up',
    title: 'Follow-up ponudbe',
    subject: { kind: 'offerVersion', id: offer._id, label: 'PON-93001' },
    assigneeRole: 'SALES',
    source: { kind: 'rule', ruleKey: 'offer.follow_up' },
  });
  return { task };
}

test('AIN-P1-13 offer follow-up email from task', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'task-follow-up-email-test' });
  await TaskModel.syncIndexes();
  await CommunicationTemplateModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  t.beforeEach(async () => {
    await Promise.all([
      CommunicationTemplateModel.deleteMany({}),
      CommunicationSenderSettingsModel.deleteMany({}),
      CrmClientModel.deleteMany({}),
      OfferVersionModel.deleteMany({}),
      ProjectModel.deleteMany({}),
      TaskModel.deleteMany({}),
    ]);
  });

  await t.test('preview renders active offer_follow_up template with offer context', async () => {
    await CommunicationTemplateModel.create({
      key: 'offer_follow_up',
      name: 'Follow-up ponudbe',
      category: 'offer_send',
      subjectTemplate: 'Preverjanje ponudbe {{offer.number}}',
      bodyTemplate: 'Pozdravljeni {{customer.name}}, ponudba {{offer.number}} znaša {{offer.total}}.',
      defaultAttachments: ['offer_pdf'],
      isActive: true,
    });
    const { task } = await makeFollowUpTask();

    const draft = await previewOfferFollowUpEmail(actor, String(task._id));

    assert.deepEqual(draft.to, ['janez@example.com']);
    assert.equal(draft.subject, 'Preverjanje ponudbe PON-93001');
    assert.match(draft.body, /Janez Novak/);
    assert.match(draft.body, /1234,56 EUR/);
    assert.deepEqual(draft.selectedAttachments, ['offer_pdf']);
    assert.equal(draft.templateKey, 'offer_follow_up');
  });

  await t.test('preview rejects non follow-up tasks', async () => {
    const task = await TaskModel.create({
      tenantId: 'inteligent',
      type: 'manual',
      title: 'Ročno opravilo',
      subject: { kind: 'none' },
      assigneeRole: 'SALES',
      source: { kind: 'user' },
    });

    await assert.rejects(previewOfferFollowUpEmail(actor, String(task._id)), /ni follow-up/);
  });

  await t.test('failed send leaves task open', async () => {
    const { task } = await makeFollowUpTask();
    await CommunicationSenderSettingsModel.create({
      _id: 'singleton',
      senderName: 'AIntel',
      senderEmail: 'noreply@example.com',
      enabled: false,
    });

    await assert.rejects(
      sendOfferFollowUpEmail(
        actor,
        String(task._id),
        { to: ['janez@example.com'], subject: 'Test', body: 'Test' },
        { context: { actorUserId: actor.actorUserId } },
      ),
      /Komunikacija po emailu ni omogočena/,
    );
    const reloaded = await TaskModel.findById(task._id).lean();
    assert.equal(reloaded?.status, 'open');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CommunicationMessageModel } from '../modules/communication/schemas/message';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';
import { linkEmailToProject, matchInboundEmail } from '../modules/email/email-ingest.service';
import { EmailMessageModel } from '../modules/email/email-message.model';
import { TaskModel } from '../modules/tasks/task.model';

// AIN-P1-14 F2: ujemanje dohodne pošte — odgovor na naš mail, številka
// dokumenta, e-naslov stranke; ročna povezava v resolve centru.

function makeProject(overrides: Record<string, unknown> = {}) {
  const n = Math.floor(Math.random() * 100000);
  return ProjectModel.create({
    id: `PRJ-${n}`,
    code: `PRJ-${n}`,
    projectNumber: n,
    createdAt: new Date().toISOString(),
    title: 'Test projekt',
    status: 'offered',
    customer: { name: 'Janez Novak', taxId: '', address: '' },
    categories: [],
    items: [],
    templates: [],
    timeline: [],
    ...overrides,
  });
}

test('AIN-P1-14 email matching', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'email-ingest-test' });
  await TaskModel.syncIndexes();
  await EmailMessageModel.syncIndexes();

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('odgovor na naš mail → reply match s projektom in ponudbo', async () => {
    const project = await makeProject();
    const sent = await CommunicationMessageModel.create({
      projectId: project.id,
      offerId: String(new mongoose.Types.ObjectId()),
      to: ['stranka@example.com'],
      subject: 'Ponudba',
      subjectFinal: 'Ponudba',
      body: 'x',
      bodyFinal: 'x',
      status: 'sent',
      providerMessageId: '<abc123@inteligent.si>',
    });
    const match = await matchInboundEmail({
      inReplyTo: '<abc123@inteligent.si>',
      references: [],
      fromAddress: 'stranka@example.com',
      subject: 'Re: Ponudba',
      text: 'Sprejmemo.',
    } as any);
    assert.equal(match?.matchedBy, 'reply');
    assert.equal(match?.projectId, project.id);
    assert.equal(match?.offerId, sent.offerId);
  });

  await t.test('PONUDBA-#### v zadevi → document-number match', async () => {
    const project = await makeProject();
    const offer = await OfferVersionModel.create({
      projectId: project.id,
      baseTitle: 'Ponudba',
      versionNumber: 1,
      title: 'Ponudba v1',
      documentNumber: 'PONUDBA-2026-999',
      status: 'sent',
      items: [],
    });
    const match = await matchInboundEmail({
      inReplyTo: undefined,
      references: [],
      fromAddress: 'nekdo@example.com',
      subject: 'Vprašanje glede PONUDBA-2026-999',
      text: '',
    } as any);
    assert.equal(match?.matchedBy, 'document-number');
    assert.equal(match?.projectId, project.id);
    assert.equal(match?.offerId, String(offer._id));
  });

  await t.test('e-naslov CRM stranke → client-email match z aktivnim projektom', async () => {
    const client = await CrmClientModel.create({ name: 'Miha K', type: 'individual', email: 'miha@example.com', isActive: true });
    const project = await makeProject({ clientId: client._id });
    const match = await matchInboundEmail({
      inReplyTo: undefined,
      references: [],
      fromAddress: 'miha@example.com',
      subject: 'Pozdrav',
      text: 'Kdaj pridete?',
    } as any);
    assert.equal(match?.matchedBy, 'client-email');
    assert.equal(match?.projectId, project.id);
  });

  await t.test('brez zadetka → null; ročna povezava nastavi matched + opravilo', async () => {
    const none = await matchInboundEmail({
      inReplyTo: undefined,
      references: [],
      fromAddress: 'neznan@example.com',
      subject: 'Splošno vprašanje',
      text: '',
    } as any);
    assert.equal(none, null);

    const project = await makeProject();
    const email = await EmailMessageModel.create({
      fromAddress: 'neznan@example.com',
      subject: 'Splošno vprašanje',
      date: new Date(),
      uid: 42,
      status: 'unmatched',
    });
    const linked = await linkEmailToProject(String(email._id), project.id);
    assert.equal(linked.status, 'matched');
    assert.equal(linked.match?.projectId, project.id);
    const task = await TaskModel.findOne({ dedupeKey: `email.inbound:${email._id}` });
    assert.ok(task, 'ročna povezava ustvari opravilo za branje');
    const updatedProject = await ProjectModel.findOne({ id: project.id }).lean();
    assert.ok(updatedProject!.timeline.some((entry: any) => entry.title === 'Prejet e-mail'));
  });
});

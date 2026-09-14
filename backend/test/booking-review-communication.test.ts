import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CommunicationTemplateModel } from '../modules/communication/schemas/template';
import { CommunicationMessageModel } from '../modules/communication/schemas/message';
import { CommunicationSenderSettingsModel } from '../modules/communication/schemas/sender-settings';
import { ProjectModel } from '../modules/projects/schemas/project';
import { UserModel } from '../modules/users/schemas/user';
import { listCommunicationTemplates, sendBookingSelectedInternalEmail } from '../modules/communication/services/communication.service';
import { renderBookingReviewTemplate } from '../modules/communication/services/booking-review-templates.service';
import { buildTemplateContext } from '../modules/communication/services/template-render.service';
import * as transport from '../modules/communication/services/email-transport.service';

let mongo: MongoMemoryServer;
test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await CommunicationSenderSettingsModel.create({
    _id: 'singleton', senderName: 'Inteligent', senderEmail: 'test@example.com', enabled: true,
  });
});
test.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
test.beforeEach(async () => {
  await Promise.all([CommunicationTemplateModel.deleteMany({}), CommunicationMessageModel.deleteMany({}),
    ProjectModel.deleteMany({}), UserModel.deleteMany({})]);
});

const context = buildTemplateContext({
  customerName: 'Žiga', projectName: 'Alarm', offerNumber: '', offerTotal: '', companyName: 'Inteligent',
  sender: { senderName: 'Inteligent', senderEmail: 'test@example.com', enabled: true },
  reviewLink: 'https://example.com/review', bookingLink: 'https://example.com/booking',
});

test('nastavitve ustvarijo predloge samo enkrat in ohranijo shranjene popravke', async () => {
  assert.equal((await listCommunicationTemplates()).length, 6);
  await CommunicationTemplateModel.updateOne({ category: 'invoice_review_request' }, { $set: { bodyTemplate: 'Hvala {{customer.name}}! {{review.link}}' } });
  await listCommunicationTemplates();
  assert.equal(await CommunicationTemplateModel.countDocuments(), 6);
  assert.equal((await renderBookingReviewTemplate('invoice_review_request', context)).body, 'Hvala Žiga! https://example.com/review');
});

test('dodatek ponudbi uporabi shranjeno besedilo in ohrani povezavo, tudi če manjka placeholder', async () => {
  await listCommunicationTemplates();
  await CommunicationTemplateModel.updateOne({ category: 'offer_booking_invite' }, { $set: { bodyTemplate: 'Izberite termin za {{project.name}}.' } });
  assert.equal((await renderBookingReviewTemplate('offer_booking_invite', context, context.booking.link)).body,
    'Izberite termin za Alarm.\nhttps://example.com/booking');
});

test('izklopljene predloge ne nadomesti hardcoded besedilo', async () => {
  await listCommunicationTemplates();
  await CommunicationTemplateModel.updateOne({ category: 'invoice_review_request' }, { $set: { isActive: false } });
  await assert.rejects(renderBookingReviewTemplate('invoice_review_request', context), /manjka aktivna predloga/);
});

async function recipientsProject() {
  const sales = await UserModel.create({ tenantId: 'inteligent', email: 'sales@example.com', roles: ['SALES', 'ADMIN'] });
  await UserModel.create({ tenantId: 'inteligent', email: 'admin@example.com', roles: ['ADMIN'] });
  await UserModel.create({ tenantId: 'inteligent', email: 'disabled@example.com', roles: ['ADMIN'], active: false });
  await UserModel.create({ tenantId: 'inteligent', email: 'deleted@example.com', roles: ['ADMIN'], deletedAt: new Date() });
  await UserModel.create({ tenantId: 'other', email: 'other@example.com', roles: ['ADMIN'] });
  await ProjectModel.create({ id: 'PRJ-980', code: 'PRJ-980', projectNumber: 980, title: 'Alarm',
    customer: { name: 'Žiga' }, salesUserId: sales._id, status: 'in-progress', createdAt: new Date().toISOString() });
}

test('email prejmeta prodajalec in admin enkrat; uporabi predlogo in interno evidenco', async (t) => {
  await recipientsProject();
  await listCommunicationTemplates();
  await CommunicationTemplateModel.updateOne({ category: 'booking_selected_internal' }, { $set: { subjectTemplate: 'Izbrano: {{project.name}}' } });
  const send = t.mock.method(transport, 'sendEmail', async () => ({ messageId: 'test' }));
  await sendBookingSelectedInternalEmail({ projectId: 'PRJ-980', workOrderId: new mongoose.Types.ObjectId().toString(), scheduledAt: '2026-09-15T09:00:00' });
  assert.equal(send.mock.callCount(), 1);
  const mail = send.mock.calls[0].arguments[0] as any;
  assert.deepEqual(mail.to.split(', ').sort(), ['admin@example.com', 'sales@example.com']);
  assert.equal(mail.subject, 'Izbrano: Alarm');
  assert.match(mail.text, /Žiga/);
  assert.equal(mail.inReplyTo, undefined);
  const message = await CommunicationMessageModel.findOne({ projectId: 'PRJ-980' });
  assert.equal(message?.audience, 'internal');
  assert.equal(message?.status, 'sent');
});

test('napaka SMTP ostane zabeležena kot neuspešno interno sporočilo', async (t) => {
  await recipientsProject();
  t.mock.method(transport, 'sendEmail', async () => { throw new Error('SMTP test failure'); });
  await assert.rejects(sendBookingSelectedInternalEmail({ projectId: 'PRJ-980', workOrderId: new mongoose.Types.ObjectId().toString(), scheduledAt: '2026-09-15T09:00:00' }), /SMTP test failure/);
  assert.equal((await CommunicationMessageModel.findOne({ projectId: 'PRJ-980' }))?.status, 'failed');
});

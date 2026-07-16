import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProjectModel } from '../modules/projects/schemas/project';
import { CommunicationTemplateModel } from '../modules/communication/schemas/template';
import { CommunicationSenderSettingsModel } from '../modules/communication/schemas/sender-settings';
import { sendBookingInviteEmail } from '../modules/communication/services/communication.service';
import { buildTemplateContext, renderCommunicationTemplate } from '../modules/communication/services/template-render.service';

// Predlogi za mail monterju in vabilo k terminu: aktivna predloga iz nastavitev
// doloci privzeti osnutek, rocno urejanje v predogledu pa ima se vedno prednost.

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_templates' });
  await CommunicationSenderSettingsModel.create({
    _id: 'singleton',
    senderName: 'Inteligent',
    senderEmail: 'prodaja@inteligent.si',
    enabled: true,
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([CommunicationTemplateModel.deleteMany({}), ProjectModel.deleteMany({})]);
});

async function projekt(id: string) {
  return ProjectModel.create({
    id, code: id, projectNumber: Number(id.split('-')[1]), title: `${id}: Alarm`,
    customer: { name: 'Janez Novak' }, status: 'in-progress', createdAt: new Date().toISOString(),
  });
}

const PREVIEW_INPUT = {
  workOrderId: new mongoose.Types.ObjectId().toString(),
  bookingLink: 'https://inteligent.si/izbira-termina?t=abc',
  durationHours: 3,
  to: ['stranka@primer.si'],
  previewOnly: true as const,
};

test('novi placeholderji se izpolnijo (installer, workOrder.details, booking)', () => {
  const context = buildTemplateContext({
    customerName: 'Janez',
    projectName: 'Alarm',
    offerNumber: '',
    offerTotal: '',
    installerName: 'Miha',
    workOrderSchedule: '20. 7. 2026 8:00',
    workOrderDetails: 'Termin\nEkipa: Miha',
    bookingLink: 'https://x/t?x=1',
    bookingDuration: '3 ure',
    companyName: 'Inteligent',
    sender: { senderName: 'I', senderEmail: 'p@i.si', enabled: true },
  });
  const rendered = renderCommunicationTemplate(
    {
      subjectTemplate: 'Priprava: {{workOrder.schedule}}',
      bodyTemplate: 'Zivjo {{installer.name}},\n{{workOrder.details}}\n{{booking.link}} ({{booking.duration}})',
    },
    context,
  );
  assert.equal(rendered.subject, 'Priprava: 20. 7. 2026 8:00');
  assert.equal(rendered.body, 'Zivjo Miha,\nTermin\nEkipa: Miha\nhttps://x/t?x=1 (3 ure)');
});

test('vabilo k terminu: aktivna predloga doloci osnutek predogleda', async () => {
  await projekt('PRJ-500');
  await CommunicationTemplateModel.create({
    key: 'vabilo-test',
    name: 'Vabilo test',
    category: 'booking_invite_send',
    subjectTemplate: 'Termin za {{project.name}}',
    bodyTemplate: 'Pozdravljeni {{customer.name}},\nizberite dan: {{booking.link}}\nTrajanje: {{booking.duration}}.',
    isActive: true,
  });

  const result = await sendBookingInviteEmail({ projectId: 'PRJ-500', ...PREVIEW_INPUT });
  const draft = (result as { draft: { to: string; subject: string; body: string } }).draft;
  assert.equal(draft.subject, 'Termin za PRJ-500: Alarm');
  assert.match(draft.body, /Pozdravljeni Janez Novak,/);
  assert.match(draft.body, /izberite dan: https:\/\/inteligent\.si\/izbira-termina\?t=abc/);
  assert.match(draft.body, /Trajanje: 3 ure\./);
});

test('vabilo k terminu: predloga brez {{booking.link}} — povezava se pripne', async () => {
  await projekt('PRJ-501');
  await CommunicationTemplateModel.create({
    key: 'vabilo-brez-linka',
    name: 'Vabilo brez linka',
    category: 'booking_invite_send',
    subjectTemplate: 'Termin',
    bodyTemplate: 'Pozdravljeni, izberite dan montaze.',
    isActive: true,
  });

  const result = await sendBookingInviteEmail({ projectId: 'PRJ-501', ...PREVIEW_INPUT });
  const draft = (result as { draft: { body: string } }).draft;
  assert.match(draft.body, /Povezava za izbiro termina: https:\/\/inteligent\.si\/izbira-termina\?t=abc/);
});

test('vabilo k terminu: brez predloge ostane vgrajeno besedilo, neaktivna ne steje', async () => {
  await projekt('PRJ-502');
  await CommunicationTemplateModel.create({
    key: 'vabilo-izklopljena',
    name: 'Izklopljena',
    category: 'booking_invite_send',
    subjectTemplate: 'NE SME V OSNUTEK',
    bodyTemplate: 'ne sme v osnutek',
    isActive: false,
  });

  const result = await sendBookingInviteEmail({ projectId: 'PRJ-502', ...PREVIEW_INPUT });
  const draft = (result as { draft: { subject: string; body: string } }).draft;
  assert.equal(draft.subject, 'Izbira termina montaže — PRJ-502: Alarm');
  assert.match(draft.body, /vaša montaža je pripravljena/);
});

test('vabilo k terminu: rocno vpisana zadeva/vsebina imata prednost pred predlogo', async () => {
  await projekt('PRJ-503');
  await CommunicationTemplateModel.create({
    key: 'vabilo-prednost',
    name: 'Prednost',
    category: 'booking_invite_send',
    subjectTemplate: 'Iz predloge',
    bodyTemplate: 'Iz predloge: {{booking.link}}',
    isActive: true,
  });

  const result = await sendBookingInviteEmail({
    projectId: 'PRJ-503',
    ...PREVIEW_INPUT,
    subject: 'Rocna zadeva',
    body: `Rocno besedilo: ${PREVIEW_INPUT.bookingLink}`,
  });
  const draft = (result as { draft: { subject: string; body: string } }).draft;
  assert.equal(draft.subject, 'Rocna zadeva');
  assert.equal(draft.body, `Rocno besedilo: ${PREVIEW_INPUT.bookingLink}`);
});

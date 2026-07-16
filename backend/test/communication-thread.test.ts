import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CommunicationMessageModel } from '../modules/communication/schemas/message';
import { EmailMessageModel } from '../modules/email/email-message.model';
import { applyEmailTrap } from '../modules/communication/services/email-transport.service';
import {
  buildThreadHeaders,
  normalizirajMessageId,
  skrajsajReference,
} from '../modules/communication/services/thread.service';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await CommunicationMessageModel.deleteMany({});
  await EmailMessageModel.deleteMany({});
});

async function poslji(projectId: string, messageId: string, subject: string, minut: number, references: string[] = []) {
  const cas = new Date(Date.now() - minut * 60_000);
  return CommunicationMessageModel.create({
    projectId,
    direction: 'outbound',
    channel: 'email',
    to: ['stranka@primer.si'],
    subjectFinal: subject,
    bodyFinal: 'besedilo',
    status: 'sent',
    sentAt: cas,
    createdAt: cas,
    providerMessageId: messageId,
    references,
  });
}

async function odgovor(projectId: string | undefined, messageId: string, inReplyTo: string, minut: number) {
  return EmailMessageModel.create({
    tenantId: 'inteligent',
    messageId,
    inReplyTo,
    references: [inReplyTo],
    fromAddress: 'stranka@primer.si',
    subject: 'Re: Ponudba',
    date: new Date(Date.now() - minut * 60_000),
    uid: Math.floor(Math.random() * 100000),
    direction: 'inbound',
    status: projectId ? 'matched' : 'unmatched',
    match: projectId ? { projectId } : undefined,
  });
}

test('prvo sporocilo projekta odpre svojo nit (brez glav)', async () => {
  const glave = await buildThreadHeaders('PRJ-001');
  assert.deepEqual(glave, {});
});

test('druga verzija ponudbe se pripne na prvo', async () => {
  await poslji('PRJ-002', '<prva@inteligent.si>', 'Ponudba za alarm', 60);
  const glave = await buildThreadHeaders('PRJ-002');
  assert.equal(glave.inReplyTo, '<prva@inteligent.si>');
  assert.deepEqual(glave.references, ['<prva@inteligent.si>']);
});

test('nova ponudba se pripne na ODGOVOR stranke, ne na nase zadnje sporocilo', async () => {
  await poslji('PRJ-003', '<nasa@inteligent.si>', 'Ponudba', 120);
  await odgovor('PRJ-003', '<strankin@gmail.com>', '<nasa@inteligent.si>', 30);

  const glave = await buildThreadHeaders('PRJ-003');
  assert.equal(glave.inReplyTo, '<strankin@gmail.com>', 'stars mora biti novejsi clen — odgovor stranke');
  assert.deepEqual(glave.references, ['<nasa@inteligent.si>', '<strankin@gmail.com>']);
});

test('veriga raste skozi vec izmenjav', async () => {
  await poslji('PRJ-004', '<v1@inteligent.si>', 'Ponudba', 300);
  await odgovor('PRJ-004', '<odg1@gmail.com>', '<v1@inteligent.si>', 200);
  await poslji('PRJ-004', '<v2@inteligent.si>', 'Ponudba', 100, ['<v1@inteligent.si>', '<odg1@gmail.com>']);

  const glave = await buildThreadHeaders('PRJ-004');
  assert.equal(glave.inReplyTo, '<v2@inteligent.si>');
  assert.deepEqual(glave.references, ['<v1@inteligent.si>', '<odg1@gmail.com>', '<v2@inteligent.si>']);
});

// Iz pravih podatkov (PRJ-217): prva zadeva je imela tipkarsko napako, popravek
// je prisel sele v naslednji. Zadeva niti mora slediti popravku, ne napaki.
test('zadeva se prevzame iz ZADNJEGA odhodnega (popravek se ohrani)', async () => {
  await poslji('PRJ-005', '<prva@inteligent.si>', 'DVC videonadzor - ponubda', 120);
  await poslji('PRJ-005', '<druga@inteligent.si>', 'DVC videonadzor - ponudba', 60);

  const glave = await buildThreadHeaders('PRJ-005');
  assert.equal(glave.threadSubject, 'DVC videonadzor - ponudba');
});

test('strankin "Re: ..." ne postane zadeva nase nove ponudbe', async () => {
  await poslji('PRJ-010', '<nasa@inteligent.si>', 'Ponudba za alarm', 120);
  await odgovor('PRJ-010', '<strankin@gmail.com>', '<nasa@inteligent.si>', 30);

  const glave = await buildThreadHeaders('PRJ-010');
  assert.equal(glave.inReplyTo, '<strankin@gmail.com>', 'glave se pripnejo na odgovor');
  assert.equal(glave.threadSubject, 'Ponudba za alarm', 'zadeva pa ostane nasa');
});

test('nit drugega projekta ne pronica sem', async () => {
  await poslji('PRJ-006', '<tuja@inteligent.si>', 'Tuja ponudba', 10);
  const glave = await buildThreadHeaders('PRJ-007');
  assert.deepEqual(glave, {});
});

test('nepovezan odgovor (brez projekta) ne vstopi v nit', async () => {
  await poslji('PRJ-008', '<nasa@inteligent.si>', 'Ponudba', 120);
  await odgovor(undefined, '<tujec@gmail.com>', '<nekaj@drugje.si>', 10);

  const glave = await buildThreadHeaders('PRJ-008');
  assert.equal(glave.inReplyTo, '<nasa@inteligent.si>');
});

test('neuspelo sporocilo ni clen niti', async () => {
  await CommunicationMessageModel.create({
    projectId: 'PRJ-009',
    direction: 'outbound',
    channel: 'email',
    to: ['stranka@primer.si'],
    subjectFinal: 'Ponudba',
    bodyFinal: 'besedilo',
    status: 'failed',
    providerMessageId: '<neuspela@inteligent.si>',
  });
  const glave = await buildThreadHeaders('PRJ-009');
  assert.deepEqual(glave, {});
});

test('Message-ID brez oglatih oklepajev se popravi', () => {
  assert.equal(normalizirajMessageId('abc@inteligent.si'), '<abc@inteligent.si>');
  assert.equal(normalizirajMessageId('<abc@inteligent.si>'), '<abc@inteligent.si>');
  assert.equal(normalizirajMessageId('  '), null);
  assert.equal(normalizirajMessageId(null), null);
});

test('dolga veriga obdrzi korenino in zadnje clene', () => {
  const veriga = Array.from({ length: 30 }, (_, i) => `<m${i}@inteligent.si>`);
  const skrajsana = skrajsajReference(veriga);
  assert.equal(skrajsana.length, 20);
  assert.equal(skrajsana[0], '<m0@inteligent.si>', 'korenina drzi nit skupaj');
  assert.equal(skrajsana[skrajsana.length - 1], '<m29@inteligent.si>');
});

test('varovalo za staging posto ohrani glave niti', () => {
  process.env.AINTEL_EMAIL_TRAP_ENABLED = 'true';
  process.env.AINTEL_EMAIL_TRAP_TO = 'past@inteligent.si';
  const out = applyEmailTrap({
    to: 'stranka@primer.si',
    subject: 'Ponudba',
    inReplyTo: '<prva@inteligent.si>',
    references: ['<prva@inteligent.si>'],
  });
  assert.equal(out.inReplyTo, '<prva@inteligent.si>', 'nit mora prezivet preusmeritev, sicer je na stagingu ne moremo preizkusiti');
  assert.deepEqual(out.references, ['<prva@inteligent.si>']);
  assert.equal(out.to, 'past@inteligent.si');
  delete process.env.AINTEL_EMAIL_TRAP_ENABLED;
  delete process.env.AINTEL_EMAIL_TRAP_TO;
});

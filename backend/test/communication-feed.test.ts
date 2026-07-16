import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CommunicationEventModel } from '../modules/communication/schemas/event';
import { EmailMessageModel } from '../modules/email/email-message.model';
import { listProjectCommunicationFeed } from '../modules/communication/services/communication.service';

// Potek komunikacije projekta mora pokazati OBE smeri pogovora: naso posto
// (communication_events) in strankine odgovore (email_messages z match.projectId).

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
  await CommunicationEventModel.deleteMany({});
  await EmailMessageModel.deleteMany({});
});

async function dogodek(projectId: string, title: string, minut: number) {
  return CommunicationEventModel.create({
    projectId,
    type: 'email_sent',
    title,
    description: 'poslano stranki',
    timestamp: new Date(Date.now() - minut * 60_000),
  });
}

async function dohodni(projectId: string | undefined, subject: string, minut: number, status?: string) {
  return EmailMessageModel.create({
    tenantId: 'inteligent',
    messageId: `<${Math.random().toString(36).slice(2)}@gmail.com>`,
    fromAddress: 'stranka@primer.si',
    fromName: 'Janez Novak',
    subject,
    text: 'Pozdravljeni, ustreza mi termin v sredo.\nLp, Janez',
    date: new Date(Date.now() - minut * 60_000),
    uid: Math.floor(Math.random() * 100000),
    direction: 'inbound',
    status: status ?? (projectId ? 'matched' : 'unmatched'),
    match: projectId ? { projectId } : undefined,
  });
}

test('potek zdruzi naso posto in odgovor stranke po casu', async () => {
  await dogodek('PRJ-100', 'Ponudba poslana', 120);
  await dohodni('PRJ-100', 'Re: Ponudba', 60);
  await dogodek('PRJ-100', 'Racun poslan', 10);

  const feed = await listProjectCommunicationFeed('PRJ-100');
  assert.deepEqual(
    feed.map((entry) => entry.title),
    ['Racun poslan', 'Odgovor stranke', 'Ponudba poslana'],
  );
  const odgovor = feed[1];
  assert.equal(odgovor.type, 'email_received');
  assert.equal(odgovor.description, 'Re: Ponudba');
  assert.equal(odgovor.metadata?.from, 'Janez Novak <stranka@primer.si>');
  assert.match(odgovor.metadata?.snippet ?? '', /termin v sredo/);
});

test('nepovezani in ignorirani (bancni) maili ne vstopijo v potek', async () => {
  await dohodni(undefined, 'Nekaj tretjega', 30);
  // Bancni mail dobi match preko rocne povezave sele, ce ni ignoriran —
  // ignoriran status ga mora izlociti tudi ce ima projectId.
  await dohodni('PRJ-101', 'Obvestilo o prilivu', 20, 'ignored');

  const feed = await listProjectCommunicationFeed('PRJ-101');
  assert.equal(feed.length, 0);
});

test('potek drugega projekta ne pronica sem', async () => {
  await dohodni('PRJ-102', 'Re: Ponudba', 30);
  const feed = await listProjectCommunicationFeed('PRJ-103');
  assert.equal(feed.length, 0);
});

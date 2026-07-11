import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  signDocToken,
  verifyDocToken,
  listClientDocuments,
  generateClientDocument,
} from '../modules/documents/client-documents.service';

test('ECO-29 client documents (signed URLs)', async (t) => {
  process.env.AINTEL_DOC_URL_SECRET = 'test-secret-eco29';
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'client-documents-test' });

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('token round-trips and carries the payload', () => {
    const token = signDocToken({ c: 'client1', t: 'offer', p: 'PRJ-1', d: 'off1' });
    const payload = verifyDocToken(token);
    assert.ok(payload);
    assert.equal(payload!.c, 'client1');
    assert.equal(payload!.t, 'offer');
    assert.equal(payload!.d, 'off1');
  });

  await t.test('tampered or malformed token is rejected', () => {
    const token = signDocToken({ c: 'client1', t: 'offer', p: 'PRJ-1', d: 'off1' });
    assert.equal(verifyDocToken(token.slice(0, -3) + 'xyz'), null); // broken sig
    assert.equal(verifyDocToken('garbage'), null);
    assert.equal(verifyDocToken(''), null);
  });

  await t.test('expired token is rejected', () => {
    const token = signDocToken({ c: 'client1', t: 'invoice', p: 'PRJ-1', d: 'inv1' }, -1000);
    assert.equal(verifyDocToken(token), null);
  });

  await t.test('generateClientDocument rejects an invalid token before any DB work', async () => {
    const res = await generateClientDocument('not-a-token');
    assert.deepEqual(res, { error: 'INVALID' });
  });

  await t.test('listClientDocuments returns issued offers + invoices with tokens', async () => {
    const clientId = new mongoose.Types.ObjectId();
    const offerId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('crmclients').insertOne({ _id: clientId, name: 'Doc Stranka', email: 'doc@example.com', isActive: true });
    await mongoose.connection.collection('projects').insertOne({
      _id: new mongoose.Types.ObjectId(),
      id: 'PRJ-700',
      clientId,
      title: 'Videonadzor Doc',
      customer: { name: 'Doc Stranka' },
      createdAt: '2026-04-01T00:00:00Z',
      invoiceVersions: [
        { _id: new mongoose.Types.ObjectId().toString(), status: 'issued', invoiceNumber: 'RAC-2026-5', issuedAt: '2026-04-10T00:00:00Z' },
        { _id: new mongoose.Types.ObjectId().toString(), status: 'draft', invoiceNumber: null, issuedAt: null },
      ],
    });
    await mongoose.connection.collection('offerversions').insertMany([
      { _id: offerId, projectId: 'PRJ-700', status: 'offered', documentNumber: 'PON-2026-9', createdAt: new Date('2026-04-02T00:00:00Z') },
      { _id: new mongoose.Types.ObjectId(), projectId: 'PRJ-700', status: 'draft', documentNumber: null, createdAt: new Date() },
    ]);

    const byId = await listClientDocuments({ clientId: String(clientId), email: null });
    assert.equal(byId.clientId, String(clientId));
    const types = byId.documents.map((d) => d.type).sort();
    assert.deepEqual(types, ['invoice', 'offer']); // draft offer + draft invoice excluded
    assert.ok(byId.documents.every((d) => typeof d.token === 'string' && d.token.includes('.')));

    // Email fallback resolves the same client.
    const byEmail = await listClientDocuments({ clientId: null, email: 'doc@example.com' });
    assert.equal(byEmail.documents.length, 2);

    // A valid token for a foreign client must not resolve the document.
    const foreignToken = signDocToken({ c: String(new mongoose.Types.ObjectId()), t: 'offer', p: 'PRJ-700', d: String(offerId) });
    assert.deepEqual(await generateClientDocument(foreignToken), { error: 'NOT_FOUND' });
  });

  await t.test('unknown client yields no documents', async () => {
    const res = await listClientDocuments({ clientId: null, email: 'nobody@example.com' });
    assert.deepEqual(res, { clientId: null, documents: [] });
  });
});

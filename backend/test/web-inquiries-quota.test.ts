import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { WebInquiryModel } from '../modules/web-inquiries/web-inquiry.model';
import { assertInquiryQuota, WebInquiryError } from '../modules/web-inquiries/web-inquiry.service';

// ECO-18/S10: trajne kvote na POST /inquiries iz baze (ne samo in-memory) —
// na e-naslov in globalno, okno 24 h, nastavljivo prek env.

function inquiry(email: string, overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'inteligent',
    pillar: 'videonadzor',
    status: 'novo',
    contact: { firstName: 'Test', lastName: 'Kvota', email, phone: '000' },
    ...overrides,
  };
}

async function pricakujKvoto(fn: () => Promise<void>) {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof WebInquiryError);
    assert.equal(err.code, 'QUOTA_EXCEEDED');
    assert.equal(err.statusCode, 429);
    return true;
  });
}

test('ECO-18 assertInquiryQuota', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'web-inquiries-quota-test' });

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
    delete process.env.AINTEL_WEB_QUOTA_EMAIL_PER_DAY;
    delete process.env.AINTEL_WEB_QUOTA_GLOBAL_PER_DAY;
  });

  t.beforeEach(async () => {
    await WebInquiryModel.deleteMany({});
    delete process.env.AINTEL_WEB_QUOTA_EMAIL_PER_DAY;
    delete process.env.AINTEL_WEB_QUOTA_GLOBAL_PER_DAY;
  });

  await t.test('pod kvoto ne vrže', async () => {
    await WebInquiryModel.create([inquiry('a@test.si'), inquiry('a@test.si')]);
    await assertInquiryQuota('a@test.si');
  });

  await t.test('privzeta kvota na e-naslov (5/24h)', async () => {
    await WebInquiryModel.create([1, 2, 3, 4, 5].map(() => inquiry('b@test.si')));
    await pricakujKvoto(() => assertInquiryQuota('b@test.si'));
    await assertInquiryQuota('drug@test.si'); // drug e-naslov ni prizadet
  });

  await t.test('env override kvote na e-naslov', async () => {
    process.env.AINTEL_WEB_QUOTA_EMAIL_PER_DAY = '2';
    await WebInquiryModel.create([inquiry('c@test.si'), inquiry('c@test.si')]);
    await pricakujKvoto(() => assertInquiryQuota('c@test.si'));
  });

  await t.test('globalna kvota prek env', async () => {
    process.env.AINTEL_WEB_QUOTA_GLOBAL_PER_DAY = '3';
    await WebInquiryModel.create([inquiry('d1@test.si'), inquiry('d2@test.si'), inquiry('d3@test.si')]);
    await pricakujKvoto(() => assertInquiryQuota('d4@test.si'));
  });

  await t.test('povpraševanja, starejša od 24 h, ne štejejo', async () => {
    process.env.AINTEL_WEB_QUOTA_EMAIL_PER_DAY = '2';
    const stara = new Date(Date.now() - 25 * 3600 * 1000);
    await WebInquiryModel.collection.insertMany([
      { ...inquiry('e@test.si'), createdAt: stara },
      { ...inquiry('e@test.si'), createdAt: stara },
    ]);
    await assertInquiryQuota('e@test.si');
  });

  await t.test('drug tenant se ne šteje', async () => {
    process.env.AINTEL_WEB_QUOTA_EMAIL_PER_DAY = '2';
    await WebInquiryModel.create([
      inquiry('f@test.si', { tenantId: 'drug' }),
      inquiry('f@test.si', { tenantId: 'drug' }),
    ]);
    await assertInquiryQuota('f@test.si');
  });
});

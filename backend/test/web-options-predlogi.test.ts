import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { WebInquiryModel } from '../modules/web-inquiries/web-inquiry.model';
import {
  izracunajKonfiguratorPredloge,
  webSalesQty,
  webTopSalesKey,
} from '../modules/web-inquiries/web-inquiry.service';

// ECO-36: predlogi »najpogosteje izbrano« za spletni konfigurator morajo priti
// iz lastne statistike (salesStats + zgodovina povpraševanj), z minimalnim
// vzorcem, sicer null (frontend takrat ne kaže značke).

function inquiry(overrides: Record<string, unknown>) {
  return {
    tenantId: 'inteligent',
    pillar: 'videonadzor',
    status: 'novo',
    contact: {
      firstName: 'Test',
      lastName: 'Predlogi',
      email: 'test+predlogi@example.com',
      phone: '000',
    },
    ...overrides,
  };
}

test('ECO-36 webSalesQty/webTopSalesKey', async (t) => {
  await t.test('soldQty365 ima prednost, soldQty je rezerva, sicer 0', () => {
    assert.equal(webSalesQty({ salesStats: { soldQty365: 7, soldQty: 99 } }), 7);
    assert.equal(webSalesQty({ salesStats: { soldQty: 5 } }), 5);
    assert.equal(webSalesQty({ salesStats: {} }), 0);
    assert.equal(webSalesQty(null), 0);
  });

  await t.test('topSalesKey vrne najbolj prodanega, null brez prodaje', () => {
    assert.equal(
      webTopSalesKey([
        { key: 'A', product: { salesStats: { soldQty365: 2 } } },
        { key: 'B', product: { salesStats: { soldQty365: 9 } } },
        { key: 'C', product: null },
      ]),
      'B'
    );
    assert.equal(
      webTopSalesKey([
        { key: 'A', product: { salesStats: {} } },
        { key: 'B', product: null },
      ]),
      null
    );
  });
});

test('ECO-36 izracunajKonfiguratorPredloge iz zgodovine povpraševanj', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'web-options-predlogi-test' });

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('premalo podatkov → oba predloga null', async () => {
    await WebInquiryModel.deleteMany({});
    await WebInquiryModel.create([
      inquiry({ payload: { videonadzor: { cameraCount: 4 } }, meta: { qualityLevel: 'priporocena' } }),
      inquiry({ payload: { videonadzor: { cameraCount: 4 } }, meta: { qualityLevel: 'priporocena' } }),
    ]);
    const predlogi = await izracunajKonfiguratorPredloge('inteligent');
    assert.equal(predlogi.cameraCount, null);
    assert.equal(predlogi.kakovost, null);
  });

  await t.test('dovolj podatkov → najpogostejša vrednost', async () => {
    await WebInquiryModel.deleteMany({});
    await WebInquiryModel.create([
      inquiry({ payload: { videonadzor: { cameraCount: 4 } }, meta: { qualityLevel: 'priporocena' } }),
      inquiry({ payload: { videonadzor: { cameraCount: 4 } }, meta: { qualityLevel: 'priporocena' } }),
      inquiry({ payload: { videonadzor: { cameraCount: 4 } }, meta: { qualityLevel: 'priporocena' } }),
      inquiry({ payload: { videonadzor: { cameraCount: 8 } }, meta: { qualityLevel: 'osnovna' } }),
      inquiry({ pillar: 'alarm', payload: {}, meta: { qualityLevel: 'osnovna' } }),
    ]);
    const predlogi = await izracunajKonfiguratorPredloge('inteligent');
    assert.equal(predlogi.cameraCount, 4);
    assert.equal(predlogi.kakovost, 'priporocena');
  });

  await t.test('drug tenant se ne meša v statistiko', async () => {
    await WebInquiryModel.deleteMany({});
    await WebInquiryModel.create([
      inquiry({ tenantId: 'drug', payload: { videonadzor: { cameraCount: 2 } } }),
      inquiry({ tenantId: 'drug', payload: { videonadzor: { cameraCount: 2 } } }),
      inquiry({ tenantId: 'drug', payload: { videonadzor: { cameraCount: 2 } } }),
    ]);
    const predlogi = await izracunajKonfiguratorPredloge('inteligent');
    assert.equal(predlogi.cameraCount, null);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProjectModel } from '../modules/projects/schemas/project';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { confirmOfferForProject } from '../modules/projects/controllers/logistics.controller';
import { registerCoreConfigNamespaces } from '../modules/settings/config/config-namespaces';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_offer_confirm' });
  registerCoreConfigNamespaces();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('potrditev ponudbe: znesek projekta brez DDV je po popustih in se ujema z DDV in skupnim zneskom', async () => {
  await ProjectModel.create({
    id: 'PRJ-501', code: 'PRJ-501', projectNumber: 501, title: 'PRJ-501: Popust',
    customer: { name: 'Testna stranka' }, status: 'offered', createdAt: new Date().toISOString(),
  });
  // 2 × 100 €, 10 % na postavko, 10 % skupno, 20 € fiksno → 200 − 20 − 18 − 20 = 142 € neto.
  const offer = await OfferVersionModel.create({
    projectId: 'PRJ-501', baseTitle: 'Ponudba', versionNumber: 1, title: 'Ponudba', status: 'sent',
    usePerItemDiscount: true, useGlobalDiscount: true, globalDiscountPercent: 10, fixedDiscountAmount: 20, vatMode: 22,
    items: [{
      id: 'i1', name: 'Kamera', quantity: 2, unit: 'kos', unitPrice: 100, vatRate: 22, discountPercent: 10,
      totalNet: 200, totalVat: 44, totalGross: 244,
    }],
  });

  const result = await confirmOfferForProject({ projectId: 'PRJ-501', offerId: String(offer._id), actorDisplayName: 'Test' });
  assert.ok(result);

  const project = await ProjectModel.findOne({ id: 'PRJ-501' }).lean();
  assert.equal(project?.quotedTotal, 142);
  assert.equal(project?.quotedVat, 31.24);
  assert.equal(project?.quotedTotalWithVat, 173.24);
  assert.equal(Number(((project?.quotedTotal ?? 0) + (project?.quotedVat ?? 0)).toFixed(2)), project?.quotedTotalWithVat);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  buildCopiedProjectTitle,
  cloneProject,
  listClientProjects,
} from '../modules/projects/controllers/project.controller';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';

function createResponse() {
  const result: { ok: boolean; statusCode: number; data?: any; error?: string } = { ok: false, statusCode: 0 };
  const res = {
    success(data?: unknown, statusCode = 200) {
      result.ok = true;
      result.statusCode = statusCode;
      result.data = data;
      return res;
    },
    fail(error?: string, statusCode = 500) {
      result.ok = false;
      result.statusCode = statusCode;
      result.error = error;
      return res;
    },
  };
  return { res, result };
}

test('copy title replaces the source project code', () => {
  assert.equal(
    buildCopiedProjectTitle('PRJ-141: Alarm - Testna stranka', 'PRJ-142'),
    'PRJ-142: Alarm - Testna stranka',
  );
});

test('cloneProject copies project content and offer drafts without operational history', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_project_clone' });

  try {
    const clientId = new mongoose.Types.ObjectId();
    await ProjectModel.create({
      id: 'PRJ-141',
      code: 'PRJ-141',
      projectNumber: 141,
      clientId,
      title: 'PRJ-141: Alarm - Testna stranka',
      customer: {
        name: 'Testna stranka d.o.o.',
        taxId: 'SI12345678',
        address: 'Testna ulica 1',
        paymentTerms: '30 dni',
      },
      status: 'invoiced',
      offerAmount: 122,
      quotedTotal: 100,
      quotedVat: 22,
      quotedTotalWithVat: 122,
      invoiceAmount: 122,
      createdAt: new Date().toISOString(),
      requirementsText: 'Alarm in videonadzor',
      requirements: [{ id: 'req-1', label: 'Alarm', categorySlug: 'alarm', value: 'Da' }],
      items: [
        {
          id: 'project-item-1',
          name: 'Centrala',
          sku: 'CENT-1',
          unit: 'kos',
          quantity: 1,
          price: 100,
          discount: 0,
          vatRate: 22,
          total: 122,
          category: 'material',
        },
      ],
      offers: [],
      workOrders: [
        {
          id: 'work-order-1',
          team: 'Monter',
          schedule: '2026-08-10',
          location: 'Testna ulica 1',
          status: 'completed',
        },
      ],
      purchaseOrders: [],
      deliveryNotes: [],
      timeline: [],
      templates: [],
      categories: ['alarm'],
      confirmedOfferVersionId: 'source-offer-id',
      invoiceVersions: [{ id: 'invoice-1', status: 'issued' }],
      executionDefinitions: [{ id: 'definition-1' }],
      executionLocations: [{ id: 'location-1' }],
    });

    const sourceOffer = await OfferVersionModel.create({
      projectId: 'PRJ-141',
      requestId: 'request-old',
      baseTitle: 'Ajax alarm',
      versionNumber: 1,
      title: 'Ajax alarm_1',
      documentNumber: 'P-2026-141',
      sentAt: new Date(),
      sentByUserId: 'user-1',
      sentVia: 'email',
      comment: 'Komentar ponudbe',
      items: [
        {
          id: 'offer-item-1',
          productId: null,
          name: 'Centrala',
          quantity: 1,
          unit: 'kos',
          unitPrice: 100,
          vatRate: 22,
          totalNet: 100,
          totalVat: 22,
          totalGross: 122,
          discountPercent: 0,
        },
      ],
      totalNet: 100,
      totalVat22: 22,
      totalVat95: 0,
      totalVat: 22,
      totalGross: 122,
      discountPercent: 0,
      globalDiscountPercent: 0,
      discountAmount: 0,
      totalNetAfterDiscount: 100,
      totalGrossAfterDiscount: 122,
      useGlobalDiscount: true,
      usePerItemDiscount: false,
      vatMode: 22,
      baseWithoutVat: 100,
      perItemDiscountAmount: 0,
      globalDiscountAmount: 0,
      baseAfterDiscount: 100,
      vatAmount: 22,
      totalWithVat: 122,
      status: 'sent',
    });

    const { res, result } = createResponse();
    await cloneProject(
      {
        params: { id: 'PRJ-141' },
        context: { user: { name: 'Testni uporabnik' } },
      } as any,
      res as any,
    );

    assert.equal(result.ok, true, result.error);
    assert.equal(result.statusCode, 201);
    assert.equal(result.data.id, 'PRJ-142');
    assert.equal(result.data.title, 'PRJ-142: Alarm - Testna stranka');

    const copiedProject = await ProjectModel.findOne({ id: 'PRJ-142' }).lean();
    assert.ok(copiedProject);
    assert.equal(copiedProject.customer.name, 'Testna stranka d.o.o.');
    assert.equal(copiedProject.requirementsText, 'Alarm in videonadzor');
    assert.deepEqual(copiedProject.categories, ['alarm']);
    assert.equal(copiedProject.items.length, 1);
    assert.equal(copiedProject.workOrders.length, 0);
    assert.equal(copiedProject.invoiceVersions?.length, 0);
    assert.equal(copiedProject.executionDefinitions?.length, 0);
    assert.equal(copiedProject.executionLocations?.length, 0);
    assert.equal(copiedProject.confirmedOfferVersionId, null);
    assert.equal(copiedProject.invoiceAmount, 0);

    const copiedOffers = await OfferVersionModel.find({ projectId: 'PRJ-142' }).lean();
    assert.equal(copiedOffers.length, 1);
    assert.equal(copiedOffers[0].baseTitle, 'Ajax alarm');
    assert.equal(copiedOffers[0].totalWithVat, 122);
    assert.equal(copiedOffers[0].status, 'draft');
    assert.equal(copiedOffers[0].requestId, null);
    assert.equal(copiedOffers[0].sentAt, null);
    assert.notEqual(String(copiedOffers[0]._id), String(sourceOffer._id));

    const unchangedSourceOffer = await OfferVersionModel.findById(sourceOffer._id).lean();
    assert.equal(unchangedSourceOffer?.status, 'sent');
    assert.equal(unchangedSourceOffer?.documentNumber, 'P-2026-141');

    const { res: projectsRes, result: projectsResult } = createResponse();
    await listClientProjects(
      { params: { id: 'PRJ-142' }, context: { roles: [] } } as any,
      projectsRes as any,
    );
    assert.equal(projectsResult.ok, true, projectsResult.error);
    assert.deepEqual(
      projectsResult.data.map((project: any) => project.id),
      ['PRJ-142', 'PRJ-141'],
    );
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

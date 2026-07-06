import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProductModel } from '../modules/cenik/product.model';
import { FinanceSnapshotModel } from '../modules/finance/schemas/finance-snapshot';
import { MaterialOrderModel } from '../modules/projects/schemas/material-order';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import * as logisticsController from '../modules/projects/controllers/logistics.controller';
import { saveSignature } from '../modules/projects/controllers/project.controller';
import { createInvoiceFromClosing, issueInvoiceVersion } from '../modules/projects/services/invoice.service';
import { WebInquirySettingsModel } from '../modules/web-inquiries/web-inquiry-settings.model';
import { processWebInquiry } from '../modules/web-inquiries/web-inquiry.service';

type ControllerResult = {
  ok: boolean;
  statusCode: number;
  data?: any;
  error?: string;
};

function createResponse() {
  const result: ControllerResult = { ok: false, statusCode: 0 };
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

async function callController(handler: (req: any, res: any, next: (error?: unknown) => void) => unknown, req: any) {
  const { res, result } = createResponse();
  await handler(req, res, (error?: unknown) => {
    if (error) throw error;
  });
  return result;
}

async function callSignatureController(req: any) {
  const { res, result } = createResponse();
  await saveSignature(req, res as any);
  return result;
}

async function createProduct(input: { name: string; price: number; isService?: boolean }) {
  return ProductModel.create({
    ime: input.name,
    kategorija: input.isService ? 'Storitev' : 'Material',
    categorySlugs: [],
    categories: [],
    purchasePriceWithoutVat: input.price / 2,
    nabavnaCena: input.price / 2,
    prodajnaCena: input.price,
    isService: input.isService ?? false,
    isActive: true,
  });
}

test('AIN-P1-04 smoke: inquiry offer, confirmation, preparation, signature, invoice snapshot', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_smoke' });

  try {
    const [indoorUnit, outdoorUnit] = await Promise.all([
      createProduct({ name: 'Domofon notranja enota', price: 120 }),
      createProduct({ name: 'Domofon zunanja enota', price: 180 }),
    ]);

    await WebInquirySettingsModel.create({
      tenantId: 'inteligent',
      enabled: true,
      autoSendEmail: false,
      domofon: {
        notranjaEnotaProductId: indoorUnit._id,
        zunanjaEnotaProductId: outdoorUnit._id,
        scenario: 'izvedba',
      },
    });

    const inquiryResult = await processWebInquiry({
      pillar: 'domofon',
      contact: {
        firstName: 'Smoke',
        lastName: 'Tester',
        company: { name: 'Smoke Test d.o.o.', taxId: 'SI12345678' },
        email: 'smoke.tester@example.test',
        phone: '+38640111222',
        siteAddress: {
          street: 'Testna 1',
          postalCode: '1000',
          city: 'Ljubljana',
          full: 'Testna 1, 1000 Ljubljana',
        },
      },
      domofon: {
        indoorUnits: 1,
        outdoorUnits: 1,
        wiringReady: true,
      },
      source: 'test',
    });

    assert.ok(inquiryResult.inquiry.projectId, 'inquiry created a project');
    assert.ok(inquiryResult.inquiry.offerId, 'inquiry created an offer');

    const projectId = inquiryResult.inquiry.projectId!;
    const offerId = String(inquiryResult.inquiry.offerId);
    const offer = await OfferVersionModel.findById(offerId).lean();
    assert.equal(offer?.items.length, 2, 'offer contains inquiry products');

    const confirmResult = await callController(logisticsController.confirmOffer, {
      params: { projectId, offerId },
      body: {},
      context: { actorUserId: 'test-user', roles: ['ADMIN'] },
    });
    assert.equal(confirmResult.ok, true, confirmResult.error);

    const [confirmedProject, acceptedOffer, workOrder, materialOrder] = await Promise.all([
      ProjectModel.findOne({ id: projectId }).lean(),
      OfferVersionModel.findById(offerId).lean(),
      WorkOrderModel.findOne({ projectId, offerVersionId: offerId }),
      MaterialOrderModel.findOne({ projectId, offerVersionId: offerId }),
    ]);
    assert.equal(acceptedOffer?.status, 'accepted');
    assert.equal(confirmedProject?.status, 'ordered');
    assert.ok(workOrder, 'offer confirmation created a work order');
    assert.ok(materialOrder, 'offer confirmation created a material order');

    const advanceResult = await callController(logisticsController.advanceMaterialOrderStep, {
      params: { projectId, materialOrderId: String(materialOrder!._id) },
      body: { targetStep: 'Naročeno' },
    });
    assert.equal(advanceResult.ok, true, advanceResult.error);

    const advancedMaterialOrder = await MaterialOrderModel.findById(materialOrder!._id).lean();
    assert.equal(advancedMaterialOrder?.items[0]?.materialStep, 'Naročeno');

    const signatureResult = await callSignatureController({
      params: { id: projectId },
      body: {
        signerName: 'Smoke Tester',
        signature: 'data:image/png;base64,c21va2U=',
        workOrderId: String(workOrder!._id),
      },
      context: { roles: ['ADMIN'], actorUserId: 'test-user' },
    });
    assert.equal(signatureResult.ok, true, signatureResult.error);

    const signedWorkOrder = await WorkOrderModel.findById(workOrder!._id).lean();
    assert.equal(signedWorkOrder?.confirmationState, 'signed_active');
    assert.equal(signedWorkOrder?.confirmationVersions?.length, 1);

    const invoiceDraft = await createInvoiceFromClosing(projectId);
    const invoiceVersionId = invoiceDraft.activeVersionId;
    assert.ok(invoiceVersionId, 'invoice draft was created');

    const issued = await issueInvoiceVersion(projectId, invoiceVersionId!);
    const issuedVersion = issued.versions.find((version) => version._id === invoiceVersionId);
    assert.equal(issuedVersion?.status, 'issued');

    const snapshot = await FinanceSnapshotModel.findOne({ projectId }).lean();
    assert.ok(snapshot, 'invoice issue created a finance snapshot');
    assert.equal(snapshot?.invoiceVersionId, invoiceVersionId);
    assert.equal(snapshot?.invoiceNumber, issuedVersion?.invoiceNumber);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

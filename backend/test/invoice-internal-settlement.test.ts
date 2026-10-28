import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProjectModel } from '../modules/projects/schemas/project';
import { FinanceSnapshotModel } from '../modules/finance/schemas/finance-snapshot';
import { issueInvoiceVersion } from '../modules/projects/services/invoice.service';
import { getInvoiceSequentialCounterState, setInvoiceSequentialCounter } from '../modules/projects/services/document-numbering.service';

test('obračun brez računa: ustvari finančni zapis, ne porabi številke računa', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'invoice_internal_settlement' });
  try {
    await setInvoiceSequentialCounter(90);
    const versionId = new mongoose.Types.ObjectId().toString();
    await ProjectModel.create({
      id: 'PRJ-180', code: 'PRJ-180', projectNumber: 180, title: 'Interni', customer: { name: 'Stranka' }, status: 'completed', confirmedOfferVersionId: new mongoose.Types.ObjectId().toString(),
      createdAt: new Date().toISOString(),
      invoiceVersions: [{
        _id: versionId, versionNumber: 1, invoiceNumber: null, status: 'draft', issuedAt: null, createdAt: new Date().toISOString(),
        items: [{ id: 'i1', name: 'Montaža', unit: 'ura', quantity: 1, unitPrice: 50, vatPercent: 22, totalWithoutVat: 50, totalWithVat: 61, type: 'Osnovno' }],
        summary: { baseWithoutVat: 50, discountedBase: 50, vatAmount: 11, totalWithVat: 61 },
        discountPercent: 0, fixedDiscountAmount: 0, useGlobalDiscount: false, usePerItemDiscount: false, paidAmount: 0, remainingAmount: 61,
      }],
    });

    const result = await issueInvoiceVersion('PRJ-180', versionId, { internal: true, invoiceNumber: '91-10-2026' });
    const issued = result.versions.find((version) => version._id === versionId) as any;
    assert.equal(issued.status, 'issued');
    assert.equal(issued.internal, true);
    assert.equal(issued.invoiceNumber, 'INTERNO PRJ-180');
    assert.ok(await FinanceSnapshotModel.exists({ invoiceVersionId: versionId }), 'finančni zapis za plačilo monterjev');
    assert.equal((await getInvoiceSequentialCounterState()).currentSequence, 90, 'števec računov ostane');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

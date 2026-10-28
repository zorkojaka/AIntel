import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProjectModel } from '../modules/projects/schemas/project';
import { cloneInvoiceVersion, issueInvoiceVersion } from '../modules/projects/services/invoice.service';
import { getCreditNoteOptions, issueCreditNote } from '../modules/projects/services/credit-note.service';

test('dobropis: delna vračila se seštejejo točno, preseganje in dvojnik nista mogoča', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'credit_notes' });
  try {
    const versionId = new mongoose.Types.ObjectId().toString();
    await ProjectModel.create({
      id: 'PRJ-242', code: 'PRJ-242', projectNumber: 242, title: 'Vračilo', customer: { name: 'Stranka' }, status: 'completed',
      confirmedOfferVersionId: new mongoose.Types.ObjectId().toString(), createdAt: new Date().toISOString(),
      invoiceVersions: [{
        _id: versionId, versionNumber: 1, invoiceNumber: null, status: 'draft', issuedAt: null, createdAt: new Date().toISOString(),
        items: [{ id: 'kam', name: 'Kamera', unit: 'kos', quantity: 3, unitPrice: 33.33, vatPercent: 22, totalWithoutVat: 100, totalWithVat: 122, type: 'Osnovno' }],
        summary: { baseWithoutVat: 100, discountedBase: 100, vatAmount: 22, totalWithVat: 122 },
        discountPercent: 0, fixedDiscountAmount: 0, useGlobalDiscount: false, usePerItemDiscount: false, paidAmount: 0, remainingAmount: 122,
      }],
    });
    await issueInvoiceVersion('PRJ-242', versionId, { invoiceNumber: '71-8-2026' });
    const actor = { name: 'Finance' };
    const vrni = (requestId: string, quantity: number) =>
      issueCreditNote('PRJ-242', versionId, { requestId, reason: 'Vrnjeno blago', items: [{ invoiceItemId: 'kam', quantity }] }, actor);

    const first = await vrni('zahteva-0001', 1);
    assert.equal((await vrni('zahteva-0001', 1)).id, first.id, 'ista zahteva ne ustvari drugega dobropisa');
    await vrni('zahteva-0002', 1);
    await assert.rejects(vrni('zahteva-0003', 2), /presega preostalo količino/);
    await vrni('zahteva-0004', 1);

    const options = await getCreditNoteOptions('PRJ-242', versionId);
    assert.equal(options.notes.length, 3);
    assert.equal(options.creditedAmount, 122, 'tri tretjine se seštejejo v cel znesek računa, brez centa razlike');
    assert.equal(options.netTotalWithVat, 0);
    assert.equal(options.items[0].remainingQuantity, 0);
    await assert.rejects(cloneInvoiceVersion('PRJ-242', versionId));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProjectModel } from '../modules/projects/schemas/project';
import { FinanceSnapshotModel } from '../modules/finance/schemas/finance-snapshot';
import { cancelInvoiceVersion, cloneInvoiceVersion, issueInvoiceVersion } from '../modules/projects/services/invoice.service';

const statuses = async () =>
  ((await ProjectModel.findOne({ id: 'PRJ-281' }).lean()) as any).invoiceVersions.map((v: any) => `${v.versionNumber}:${v.status}:${v.invoiceNumber}`);

test('popravek: prvotni račun ostane izdan, dokler popravek ni izdan', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'invoice_correction' });
  try {
    const draftId = new mongoose.Types.ObjectId().toString();
    await ProjectModel.create({
      id: 'PRJ-281', code: 'PRJ-281', projectNumber: 281, title: 'Popravek', customer: { name: 'Stranka' }, status: 'completed',
      confirmedOfferVersionId: new mongoose.Types.ObjectId().toString(), createdAt: new Date().toISOString(),
      invoiceVersions: [{
        _id: draftId, versionNumber: 1, invoiceNumber: '87-10-2026', status: 'draft', issuedAt: null, createdAt: new Date().toISOString(),
        items: [{ id: 'i1', name: 'Montaža', unit: 'ura', quantity: 1, unitPrice: 100, vatPercent: 22, totalWithoutVat: 100, totalWithVat: 122, type: 'Osnovno' }],
        summary: { baseWithoutVat: 100, discountedBase: 100, vatAmount: 22, totalWithVat: 122 },
        discountPercent: 0, fixedDiscountAmount: 0, useGlobalDiscount: false, usePerItemDiscount: false, paidAmount: 0, remainingAmount: 122,
      }],
    });
    await issueInvoiceVersion('PRJ-281', draftId, { invoiceNumber: '87-10-2026' });

    // Popravi, nato premisli in odstrani osnutek: prvotni račun ostane veljaven.
    const firstCorrection = await cloneInvoiceVersion('PRJ-281', draftId);
    assert.deepEqual(await statuses(), ['1:issued:87-10-2026', '2:draft:87-10-2026']);
    await cancelInvoiceVersion('PRJ-281', firstCorrection.activeVersionId!);
    assert.deepEqual(await statuses(), ['1:issued:87-10-2026']);

    // Popravi in izdaj: šele zdaj se prvotni prekliče, finančni zapis pa zamenja.
    const correction = await cloneInvoiceVersion('PRJ-281', draftId);
    await issueInvoiceVersion('PRJ-281', correction.activeVersionId!);
    assert.deepEqual(await statuses(), ['1:cancelled:87-10-2026', '2:issued:87-10-2026']);
    const active = await FinanceSnapshotModel.find({ projectId: 'PRJ-281', superseded: { $ne: true } }).lean();
    assert.deepEqual(active.map((snapshot) => snapshot.invoiceVersionId), [correction.activeVersionId]);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

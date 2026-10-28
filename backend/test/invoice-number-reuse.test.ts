import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProjectModel } from '../modules/projects/schemas/project';
import { updateInvoiceVersion } from '../modules/projects/services/invoice.service';

function version(invoiceNumber: string | null, status: string, versionNumber = 1) {
  return {
    _id: new mongoose.Types.ObjectId().toString(),
    versionNumber,
    invoiceNumber,
    status,
    issuedAt: status === 'draft' ? null : new Date().toISOString(),
    items: [],
    summary: { baseWithoutVat: 0, discountedBase: 0, vatAmount: 0, totalWithVat: 0 },
  };
}

async function project(id: string, invoiceVersions: ReturnType<typeof version>[]) {
  await ProjectModel.create({
    id, code: id, projectNumber: Number(id.replace(/\D/g, '')), title: id,
    customer: { name: 'Stranka' }, status: 'in-progress', createdAt: new Date().toISOString(), invoiceVersions,
  });
}

test('number of a cancelled invoice stays taken on other projects, but not on its own', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'invoice_number_reuse' });
  try {
    const cancelled = version('50/6/2026', 'cancelled');
    const ownDraft = version(null, 'draft', 2);
    const otherDraft = version(null, 'draft');
    await project('PRJ-1', [cancelled, ownDraft]);
    await project('PRJ-2', [otherDraft]);

    await assert.rejects(
      updateInvoiceVersion('PRJ-2', otherDraft._id, { items: [], invoiceNumber: '50/6/2026' }),
      /že uporabljena/,
    );
    const own = await updateInvoiceVersion('PRJ-1', ownDraft._id, { items: [], invoiceNumber: '50/6/2026' });
    assert.equal(own.updatedVersion?.invoiceNumber ?? own.versions.find((v) => v._id === ownDraft._id)?.invoiceNumber, '50/6/2026');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

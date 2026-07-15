import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProjectModel } from '../modules/projects/schemas/project';
import { updateInvoiceVersion } from '../modules/projects/services/invoice.service';

const VERSION_ID = '507f1f77bcf86cd799439011';

type DraftOverrides = {
  discountPercent?: number;
  useGlobalDiscount?: boolean;
  usePerItemDiscount?: boolean;
  status?: 'draft' | 'issued';
};

async function createProjectWithInvoiceDraft(projectId: string, overrides: DraftOverrides = {}) {
  await ProjectModel.create({
    id: projectId,
    code: `PRJ-${projectId}`,
    projectNumber: Number(projectId.replace(/\D/g, '')) || 1,
    title: 'Testni projekt',
    customer: { name: 'Testna stranka' },
    status: 'completed',
    createdAt: new Date().toISOString(),
    invoiceVersions: [
      {
        _id: VERSION_ID,
        versionNumber: 1,
        status: overrides.status ?? 'draft',
        createdAt: new Date().toISOString(),
        issuedAt: null,
        discountPercent: overrides.discountPercent ?? 10,
        useGlobalDiscount: overrides.useGlobalDiscount ?? true,
        usePerItemDiscount: overrides.usePerItemDiscount ?? false,
        items: [],
        summary: { baseWithoutVat: 0, discountedBase: 0, vatAmount: 0, totalWithVat: 0 },
      },
    ],
  });
}

// Osnova 200 € (2 × 100 €), DDV 22 %.
const ITEMS = [
  { id: 'postavka-1', name: 'Kamera', unit: 'kos', quantity: 2, unitPrice: 100, vatPercent: 22, type: 'Osnovno' as const },
];

function findVersion(response: Awaited<ReturnType<typeof updateInvoiceVersion>>) {
  const version = response.versions.find((entry) => entry._id === VERSION_ID);
  assert.ok(version, 'verzija računa je v odgovoru');
  return version!;
}

test('račun: popust iz ponudbe se ohrani, če ga ne spreminjamo', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_invoice_discount' });
  try {
    await createProjectWithInvoiceDraft('P1', { discountPercent: 10, useGlobalDiscount: true });

    const response = await updateInvoiceVersion('P1', VERSION_ID, { items: ITEMS });
    const version = findVersion(response);

    assert.equal(version.discountPercent, 10);
    assert.equal(version.useGlobalDiscount, true);
    assert.equal(version.summary.baseWithoutVat, 200);
    assert.equal(version.summary.discountedBase, 180);
    assert.equal(version.summary.vatAmount, 39.6);
    assert.equal(version.summary.totalWithVat, 219.6);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('račun: ročna sprememba popusta preračuna zneske', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_invoice_discount' });
  try {
    await createProjectWithInvoiceDraft('P2', { discountPercent: 10, useGlobalDiscount: true });

    const response = await updateInvoiceVersion('P2', VERSION_ID, { items: ITEMS, discountPercent: 25 });
    const version = findVersion(response);

    assert.equal(version.discountPercent, 25);
    assert.equal(version.useGlobalDiscount, true);
    assert.equal(version.summary.discountedBase, 150);
    assert.equal(version.summary.totalWithVat, 183);

    // Popust je obstojen — naslednje shranjevanje brez popusta ga ne izgubi.
    const reread = findVersion(await updateInvoiceVersion('P2', VERSION_ID, { items: ITEMS }));
    assert.equal(reread.discountPercent, 25);
    assert.equal(reread.summary.discountedBase, 150);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('račun: popust 0 izklopi globalni popust, popust na računu brez popusta ga vklopi', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_invoice_discount' });
  try {
    await createProjectWithInvoiceDraft('P3', { discountPercent: 10, useGlobalDiscount: true });
    const brezPopusta = findVersion(await updateInvoiceVersion('P3', VERSION_ID, { items: ITEMS, discountPercent: 0 }));
    assert.equal(brezPopusta.discountPercent, 0);
    assert.equal(brezPopusta.useGlobalDiscount, false);
    assert.equal(brezPopusta.summary.discountedBase, 200);

    // Račun, ki iz ponudbe ni imel popusta, ga mora dobiti ob vnosu odstotka.
    await createProjectWithInvoiceDraft('P4', { discountPercent: 0, useGlobalDiscount: false });
    const sPopustom = findVersion(await updateInvoiceVersion('P4', VERSION_ID, { items: ITEMS, discountPercent: 15 }));
    assert.equal(sPopustom.useGlobalDiscount, true);
    assert.equal(sPopustom.summary.discountedBase, 170);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('račun: popust se omeji na 0–100 %', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_invoice_discount' });
  try {
    await createProjectWithInvoiceDraft('P5');
    const previsok = findVersion(await updateInvoiceVersion('P5', VERSION_ID, { items: ITEMS, discountPercent: 150 }));
    assert.equal(previsok.discountPercent, 100);
    assert.equal(previsok.summary.discountedBase, 0);

    await createProjectWithInvoiceDraft('P6');
    const negativen = findVersion(await updateInvoiceVersion('P6', VERSION_ID, { items: ITEMS, discountPercent: -20 }));
    assert.equal(negativen.discountPercent, 0);
    assert.equal(negativen.useGlobalDiscount, false);

    await createProjectWithInvoiceDraft('P7');
    const nesmisel = findVersion(await updateInvoiceVersion('P7', VERSION_ID, { items: ITEMS, discountPercent: 'abc' }));
    assert.equal(nesmisel.discountPercent, 0);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('račun: izdanega računa ni mogoče popustiti', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_invoice_discount' });
  try {
    await createProjectWithInvoiceDraft('P8', { status: 'issued' });
    await assert.rejects(
      () => updateInvoiceVersion('P8', VERSION_ID, { items: ITEMS, discountPercent: 50 }),
      /Izdane verzije ni mogoče urejati/,
    );
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProjectModel } from '../modules/projects/schemas/project';
import { InvoicePaymentModel } from '../modules/payments/invoice-payment.model';
import {
  confirmedPaymentsByInvoiceNumber,
  confirmPayment,
  countOpenPayments,
  deletePayment,
  paymentStateFor,
  PaymentError,
  recordManualPayment,
} from '../modules/payments/payments.service';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_invoice_payments' });
  await InvoicePaymentModel.syncIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await ProjectModel.deleteMany({});
  await InvoicePaymentModel.deleteMany({});
});

async function ustvariProjektZRacunom(projectId: string, invoiceNumber: string, totalWithVat: number, status = 'issued') {
  return ProjectModel.create({
    id: projectId,
    code: projectId,
    projectNumber: Number(projectId.replace(/\D/g, '') || 1),
    title: `${projectId}: Videonadzor`,
    customer: { name: 'Testna stranka' },
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    invoiceVersions: [
      {
        _id: new mongoose.Types.ObjectId(),
        versionNumber: 1,
        invoiceNumber,
        status,
        issuedAt: new Date().toISOString(),
        items: [],
        summary: { baseWithoutVat: totalWithVat / 1.22, discountedBase: totalWithVat / 1.22, vatAmount: totalWithVat - totalWithVat / 1.22, totalWithVat },
      },
    ],
  });
}

test('paymentStateFor: neplačan → delno → plačan (s toleranco zaokrožitve)', () => {
  assert.equal(paymentStateFor(1000, 0), 'unpaid');
  assert.equal(paymentStateFor(1000, 400), 'partial');
  assert.equal(paymentStateFor(1000, 1000), 'paid');
  assert.equal(paymentStateFor(1000, 999.995), 'paid', 'toleranca 1 cent');
  assert.equal(paymentStateFor(0, 0), 'unpaid', 'račun brez zneska ni plačan');
});

test('ročni vnos plačila: takoj potrjen in šteje v vsoto', async () => {
  await ustvariProjektZRacunom('PRJ-100', 'RAC-2026-001', 1220);
  const payment = await recordManualPayment({ invoiceNumber: 'RAC-2026-001', amount: '1220,00' });
  assert.equal(payment.status, 'confirmed');
  assert.equal(payment.amount, 1220);
  assert.equal(payment.projectId, 'PRJ-100');

  const vsote = await confirmedPaymentsByInvoiceNumber(['RAC-2026-001']);
  assert.equal(vsote.get('RAC-2026-001')?.paidAmount, 1220);
});

test('dve delni plačili se seštejeta v plačan račun', async () => {
  await ustvariProjektZRacunom('PRJ-101', 'RAC-2026-002', 1000);
  await recordManualPayment({ invoiceNumber: 'RAC-2026-002', amount: 400 });
  await recordManualPayment({ invoiceNumber: 'RAC-2026-002', amount: 600 });

  const vsote = await confirmedPaymentsByInvoiceNumber(['RAC-2026-002']);
  const paid = vsote.get('RAC-2026-002')?.paidAmount ?? 0;
  assert.equal(paid, 1000);
  assert.equal(paymentStateFor(1000, paid), 'paid');
});

test('dve ročni plačili ne trčita na unikatnem indeksu emailMessageId (sparse past)', async () => {
  await ustvariProjektZRacunom('PRJ-102', 'RAC-2026-003', 500);
  await recordManualPayment({ invoiceNumber: 'RAC-2026-003', amount: 100 });
  await assert.doesNotReject(recordManualPayment({ invoiceNumber: 'RAC-2026-003', amount: 100 }));
});

test('plačila ni mogoče zabeležiti za neobstoječ ali neizdan račun', async () => {
  await ustvariProjektZRacunom('PRJ-103', 'RAC-2026-004', 500, 'draft');
  await assert.rejects(
    recordManualPayment({ invoiceNumber: 'RAC-2026-004', amount: 500 }),
    (error: unknown) => error instanceof PaymentError && error.statusCode === 404,
  );
  await assert.rejects(
    recordManualPayment({ invoiceNumber: 'NI-GA', amount: 500 }),
    (error: unknown) => error instanceof PaymentError && error.statusCode === 404,
  );
});

test('predlagano bančno plačilo: potrditev (s popravkom računa) šteje v plačano', async () => {
  await ustvariProjektZRacunom('PRJ-104', 'RAC-2026-005', 800);
  const suggested = await InvoicePaymentModel.create({
    amount: 800,
    receivedAt: new Date(),
    source: 'bank_email',
    status: 'suggested',
    invoiceNumber: 'RAC-2026-999',
    emailMessageId: 'mail-1',
  });
  assert.equal(await countOpenPayments(), 1);

  const confirmed = await confirmPayment(String(suggested._id), { invoiceNumber: 'RAC-2026-005' });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.invoiceNumber, 'RAC-2026-005');
  assert.equal(confirmed.projectId, 'PRJ-104');
  assert.equal(await countOpenPayments(), 0);

  const vsote = await confirmedPaymentsByInvoiceNumber(['RAC-2026-005']);
  assert.equal(vsote.get('RAC-2026-005')?.paidAmount, 800);
});

test('izbris napačnega vnosa odstrani plačilo iz vsote', async () => {
  await ustvariProjektZRacunom('PRJ-105', 'RAC-2026-006', 300);
  const payment = await recordManualPayment({ invoiceNumber: 'RAC-2026-006', amount: 300 });
  assert.equal(await deletePayment(String(payment._id)), true);
  const vsote = await confirmedPaymentsByInvoiceNumber(['RAC-2026-006']);
  assert.equal(vsote.get('RAC-2026-006'), undefined);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { SettingsModel } from '../modules/settings/Settings';
import { getSettings } from '../modules/settings/settings.service';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { InvoicePaymentModel } from '../modules/payments/invoice-payment.model';
import {
  advanceReferenceForOfferNumber,
  buildAdvanceInstructions,
  referenceMatchesOfferNumber,
} from '../modules/payments/advance-payment.service';
import { tryRegisterBankPayment } from '../modules/payments/bank-email.service';
import { confirmPayment } from '../modules/payments/payments.service';
import { setWheelConfig } from '../modules/scheduler/wheel-config';
import { setConfig } from '../modules/settings/config/config-store.service';
import { registerCoreConfigNamespaces } from '../modules/settings/config/config-namespaces';
import { TaskModel } from '../modules/tasks/task.model';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_advance_payments' });
  registerCoreConfigNamespaces();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([
    SettingsModel.deleteMany({}),
    OfferVersionModel.deleteMany({}),
    InvoicePaymentModel.deleteMany({}),
    TaskModel.deleteMany({}),
  ]);
  await SettingsModel.create({
    key: 'global',
    companyName: 'Inteligent d.o.o.',
    address: 'Glavna 1',
    iban: 'SI56 0123 4567 8901 234',
  });
  await getSettings(true); // osveži predpomnilnik nastavitev (test piše mimo updateSettings)
});

const KONFIG = { senders: ['obvestila@banka.si'], keywords: ['priliv'] };

async function ustvariPonudbo(documentNumber: string, projectId = 'PRJ-300') {
  return OfferVersionModel.create({
    projectId,
    baseTitle: 'Videonadzor',
    versionNumber: 1,
    title: 'Videonadzor_1',
    documentNumber,
    totalNet: 1000,
    totalVat22: 220,
    totalVat95: 0,
    totalVat: 220,
    totalGross: 1220,
    discountPercent: 0,
    globalDiscountPercent: 0,
    discountAmount: 0,
    totalNetAfterDiscount: 1000,
    totalGrossAfterDiscount: 1220,
    useGlobalDiscount: false,
    usePerItemDiscount: false,
    vatMode: 22,
    baseWithoutVat: 1000,
    perItemDiscountAmount: 0,
    globalDiscountAmount: 0,
    baseAfterDiscount: 1000,
    vatAmount: 220,
    totalWithVat: 1220,
    status: 'offered',
    items: [{
      id: 'i1', productId: null, name: 'Kamera', quantity: 1, unit: 'kos', unitPrice: 1000,
      vatRate: 22, totalNet: 1000, totalVat: 220, totalGross: 1220,
    }],
  });
}

test('sklic iz številke ponudbe in ujemanje nazaj', () => {
  assert.equal(advanceReferenceForOfferNumber('PONUDBA-2026-167'), 'SI00 2026-167');
  assert.equal(referenceMatchesOfferNumber('SI00 2026-167', 'PONUDBA-2026-167'), true);
  assert.equal(referenceMatchesOfferNumber('SI00 2026-168', 'PONUDBA-2026-167'), false);
});

test('UPN navodila: privzeto 30 % ponudbe, zaokroženo na cel evro', async () => {
  const navodila = await buildAdvanceInstructions('PONUDBA-2026-167', 1220);
  assert.ok(navodila);
  assert.equal(navodila?.amount, 366);
  assert.equal(navodila?.reference, 'SI00 2026-167');
  assert.equal(navodila?.iban, 'SI56 0123 4567 8901 234');
  assert.equal(navodila?.recipient, 'Inteligent d.o.o.');
});

test('UPN navodila: brez IBAN ali brez ponudbe jih ni', async () => {
  await SettingsModel.updateOne({ key: 'global' }, { $set: { iban: '' } });
  await getSettings(true);
  assert.equal(await buildAdvanceInstructions('PONUDBA-2026-167', 1220), null);
  assert.equal(await buildAdvanceInstructions(null, 1220), null);
  assert.equal(await buildAdvanceInstructions('PONUDBA-2026-167', 0), null);
});

test('bančni priliv s sklicem ponudbe: manual → suggested (avans), potrditev → opravilo za SALES', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'manual' } } });
  await ustvariPonudbo('PONUDBA-2026-167');

  const payment = await tryRegisterBankPayment({
    _id: new mongoose.Types.ObjectId(),
    fromAddress: 'obvestila@banka.si',
    subject: 'Obvestilo o prilivu',
    text: 'Priliv: 366,00 EUR\nSklic: SI00 2026-167\nPlačnik: JANEZ NOVAK',
    date: new Date(),
  } as any);

  assert.equal(payment?.kind, 'advance');
  assert.equal(payment?.status, 'suggested');
  assert.equal(payment?.offerNumber, 'PONUDBA-2026-167');
  assert.equal(payment?.projectId, 'PRJ-300');

  await confirmPayment(String(payment?._id), {});
  const task = await TaskModel.findOne({ type: 'payment.advance_received' }).lean();
  assert.ok(task, 'po potrditvi avansa mora nastati opravilo za prodajo');
  assert.equal(task?.assigneeRole, 'SALES');
});

test('auto način: avans se potrdi sam in prodaja takoj dobi opravilo', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'auto' } } });
  await ustvariPonudbo('PONUDBA-2026-201', 'PRJ-301');

  const payment = await tryRegisterBankPayment({
    _id: new mongoose.Types.ObjectId(),
    fromAddress: 'obvestila@banka.si',
    subject: 'Priliv',
    text: 'Priliv 366,00 EUR, sklic SI00 2026-201.',
    date: new Date(),
  } as any);

  assert.equal(payment?.status, 'confirmed');
  assert.equal(payment?.kind, 'advance');
  assert.equal(await TaskModel.countDocuments({ type: 'payment.advance_received' }), 1);
});

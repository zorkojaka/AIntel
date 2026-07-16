import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProjectModel } from '../modules/projects/schemas/project';
import { InvoicePaymentModel } from '../modules/payments/invoice-payment.model';
import {
  isBankPaymentEmail,
  listOpenInvoices,
  matchOpenInvoice,
  parseBankPaymentEmail,
  tryRegisterBankPayment,
} from '../modules/payments/bank-email.service';
import { recordManualPayment } from '../modules/payments/payments.service';
import { setWheelConfig } from '../modules/scheduler/wheel-config';
import { setConfig } from '../modules/settings/config/config-store.service';
import { registerCoreConfigNamespaces } from '../modules/settings/config/config-namespaces';
import { TaskModel } from '../modules/tasks/task.model';

let mongod: MongoMemoryServer;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'aintel_bank_payments' });
  registerCoreConfigNamespaces();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Promise.all([
    ProjectModel.deleteMany({}),
    InvoicePaymentModel.deleteMany({}),
    TaskModel.deleteMany({}),
  ]);
});

const KONFIG = { senders: ['obvestila@banka.si'], keywords: ['priliv', 'nakazil'] };

function bancniMail(overrides: Partial<{ fromAddress: string; subject: string; text: string; date: Date; _id: mongoose.Types.ObjectId }> = {}) {
  return {
    _id: overrides._id ?? new mongoose.Types.ObjectId(),
    fromAddress: overrides.fromAddress ?? 'obvestila@banka.si',
    subject: overrides.subject ?? 'Obvestilo o prilivu',
    text:
      overrides.text ??
      'Spoštovani,\nna vaš račun je bil knjižen priliv.\nZnesek: 1.220,00 EUR\nSklic: SI00 12-7-2026\nPlačnik: JANEZ NOVAK\n',
    date: overrides.date ?? new Date(),
  } as any;
}

async function ustvariRacun(projectId: string, invoiceNumber: string, totalWithVat: number) {
  return ProjectModel.create({
    id: projectId,
    code: projectId,
    projectNumber: Number(projectId.replace(/\D/g, '') || 1),
    title: `${projectId}: Alarm`,
    customer: { name: 'Testna stranka' },
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    invoiceVersions: [
      {
        _id: new mongoose.Types.ObjectId(),
        versionNumber: 1,
        invoiceNumber,
        status: 'issued',
        issuedAt: new Date().toISOString(),
        items: [],
        summary: { baseWithoutVat: totalWithVat / 1.22, discountedBase: totalWithVat / 1.22, vatAmount: totalWithVat - totalWithVat / 1.22, totalWithVat },
      },
    ],
  });
}

test('prepoznava: pošiljatelj banke + ključna beseda; drugi maili ne', () => {
  assert.equal(isBankPaymentEmail(bancniMail(), KONFIG), true);
  assert.equal(isBankPaymentEmail(bancniMail({ fromAddress: 'stranka@gmail.com' }), KONFIG), false);
  assert.equal(
    isBankPaymentEmail(bancniMail({ subject: 'Novosti banke', text: 'Nova ponudba kreditov.' }), KONFIG),
    false,
    'brez ključne besede ni obvestilo o prilivu',
  );
  assert.equal(isBankPaymentEmail(bancniMail(), { senders: [], keywords: [] }), false, 'brez pošiljateljev je izklopljeno');
});

test('parser: znesek (slovenski format), sklic in plačnik', () => {
  const parsed = parseBankPaymentEmail('Obvestilo o prilivu', 'Znesek: 1.220,00 EUR\nSklic: SI00 12-7-2026\nPlačnik: JANEZ NOVAK');
  assert.equal(parsed.amount, 1220);
  assert.equal(parsed.reference, 'SI00 12-7-2026');
  assert.equal(parsed.payerName, 'JANEZ NOVAK');
});

test('parser: znesek ob EUR brez ključne besede in sklic za besedo referenca', () => {
  const parsed = parseBankPaymentEmail('Priliv', 'Prejeli ste nakazilo 385,50 EUR.\nReferenca: 4-7-2026');
  assert.equal(parsed.amount, 385.5);
  assert.equal(parsed.reference, '4-7-2026');
});

// Resnični format Delavske hranilnice (posredovan mail, 2026-07-16). Pasti:
// "ID transakcije: 296758102" ne sme postati znesek, "Na račun: SI56…" ne sklic,
// pošiljatelj banke pa je pri ročnem posredovanju v telesu, ne v glavi.
test('DH format: posredovano obvestilo o prilivu se pravilno prebere', () => {
  const dhBesedilo = [
    '---------- Forwarded message ---------',
    'From: DH Poslovni <Dh-Poslovni@delavska-hranilnica.si>',
    'Subject: Obvestilo o prilivu',
    '',
    'Obvestilo o prilivu - ID transakcije: 296758102',
    'Na račun: SI56***3186',
    'Plačnik: HAOCHI D.O.O.',
    'Namen: TAKOJŠNJE PLAČILO PRILIV',
    'Znesek: 243,17 EUR',
    'Referenca: SI00 0709',
    'Datum valute: 15.07.2026',
  ].join('\n');

  const dhKonfig = { senders: ['delavska-hranilnica.si'], keywords: ['priliv'] };
  assert.equal(
    isBankPaymentEmail({ fromAddress: 'jaka@inteligent.si', subject: 'Fwd: Obvestilo o prilivu', text: dhBesedilo } as any, dhKonfig),
    true,
    'posredovan mail z banko v telesu se prepozna',
  );
  assert.equal(
    isBankPaymentEmail({ fromAddress: 'jaka@inteligent.si', subject: 'Vprašanje o delavska-hranilnica.si prilivu', text: 'običajen mail' } as any, dhKonfig),
    false,
    'brez Fwd: se telo ne upošteva za pošiljatelja',
  );

  const parsed = parseBankPaymentEmail('Fwd: Obvestilo o prilivu', dhBesedilo);
  assert.equal(parsed.amount, 243.17, 'znesek, ne ID transakcije');
  assert.equal(parsed.reference, 'SI00 0709', 'referenca, ne maskiran IBAN');
  assert.equal(parsed.payerName, 'HAOCHI D.O.O.');
});

test('ujemanje: sklic s številkami računa najde pravi račun (12/7/2026 ↔ SI00 12-7-2026)', async () => {
  await ustvariRacun('PRJ-201', '12/7/2026', 1220);
  await ustvariRacun('PRJ-202', '13/7/2026', 1220);
  const open = await listOpenInvoices();
  const parsed = { amount: 1220, reference: 'SI00 12-7-2026', payerName: null };
  const match = matchOpenInvoice(parsed, 'Znesek: 1.220,00 EUR Sklic: SI00 12-7-2026', open);
  assert.equal(match?.invoice.invoiceNumber, '12/7/2026');
  assert.equal(match?.strong, true);
});

test('ujemanje: edini odprti račun s točnim zneskom je šibko ujemanje', async () => {
  await ustvariRacun('PRJ-203', '20/7/2026', 999);
  await ustvariRacun('PRJ-204', '21/7/2026', 500);
  const open = await listOpenInvoices();
  const match = matchOpenInvoice({ amount: 999, reference: null, payerName: null }, 'priliv 999,00 EUR', open);
  assert.equal(match?.invoice.invoiceNumber, '20/7/2026');
  assert.equal(match?.strong, false);
});

test('delno plačan račun se ujema po PREOSTANKU zneska', async () => {
  await ustvariRacun('PRJ-205', '22/7/2026', 1000);
  await recordManualPayment({ invoiceNumber: '22/7/2026', amount: 400 });
  const open = await listOpenInvoices();
  assert.equal(open[0]?.outstanding, 600);
  const match = matchOpenInvoice({ amount: 600, reference: null, payerName: null }, 'priliv', open);
  assert.equal(match?.invoice.invoiceNumber, '22/7/2026');
});

test('manual način: močno ujemanje → suggested + opravilo za FINANCE', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'manual' } } });
  await ustvariRacun('PRJ-206', '12/7/2026', 1220);

  const payment = await tryRegisterBankPayment(bancniMail());
  assert.equal(payment?.status, 'suggested');
  assert.equal(payment?.invoiceNumber, '12/7/2026');

  const task = await TaskModel.findOne({ type: 'payment.review' }).lean();
  assert.ok(task, 'opravilo za potrditev mora nastati');
  assert.equal(task?.assigneeRole, 'FINANCE');
});

test('auto način: močno ujemanje se potrdi samo, brez opravila', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'auto' } } });
  await ustvariRacun('PRJ-207', '12/7/2026', 1220);

  const payment = await tryRegisterBankPayment(bancniMail());
  assert.equal(payment?.status, 'confirmed');
  assert.equal(await TaskModel.countDocuments({ type: 'payment.review' }), 0);
});

test('brez najdenega računa: unmatched + nujno opravilo', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'auto' } } });

  const payment = await tryRegisterBankPayment(bancniMail({ text: 'Priliv 55,00 EUR brez sklica.' }));
  assert.equal(payment?.status, 'unmatched');
  const task = await TaskModel.findOne({ type: 'payment.review' }).lean();
  assert.equal(task?.priority, 'high');
});

test('isti mail dvakrat ne podvoji plačila', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'manual' } } });
  await ustvariRacun('PRJ-208', '12/7/2026', 1220);

  const mail = bancniMail();
  await tryRegisterBankPayment(mail);
  await tryRegisterBankPayment(mail);
  assert.equal(await InvoicePaymentModel.countDocuments({}), 1);
});

test('izklopljeno pravilo: nič se ne zgodi', async () => {
  await setConfig('finance.bank', KONFIG);
  await setWheelConfig({ rules: { 'payment.bank_email': { mode: 'off' } } });
  const payment = await tryRegisterBankPayment(bancniMail());
  assert.equal(payment, null);
  assert.equal(await InvoicePaymentModel.countDocuments({}), 0);
});

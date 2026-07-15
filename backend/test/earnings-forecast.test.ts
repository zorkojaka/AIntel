import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProductModel } from '../modules/cenik/product.model';
import { EmployeeServiceRateModel } from '../modules/employee-profiles/schemas/employee-service-rate';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { ProjectModel } from '../modules/projects/schemas/project';
import { getEarningsForecast } from '../modules/finance/services/earnings-forecast.service';

const MONTER_A = new mongoose.Types.ObjectId();
const MONTER_B = new mongoose.Types.ObjectId();

async function withMongo(fn: () => Promise<void>) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_forecast' });
  try {
    await fn();
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

async function createService(name: string, price: number) {
  return ProductModel.create({
    ime: name,
    kategorija: 'Storitev',
    categorySlugs: [],
    categories: [],
    purchasePriceWithoutVat: 0,
    nabavnaCena: 0,
    prodajnaCena: price,
    isService: true,
    isActive: true,
  });
}

async function createMaterial(name: string, price: number) {
  return ProductModel.create({
    ime: name,
    kategorija: 'Material',
    categorySlugs: [],
    categories: [],
    purchasePriceWithoutVat: price / 2,
    nabavnaCena: price / 2,
    prodajnaCena: price,
    isService: false,
    isActive: true,
  });
}

async function createConfirmedProject(params: {
  code: string;
  num: number;
  assigned: mongoose.Types.ObjectId[];
  items: Array<{ productId: mongoose.Types.ObjectId; name: string; quantity: number; unitPrice: number }>;
  acceptedAt?: Date | null;
  status?: string;
}) {
  const offer = await OfferVersionModel.create({
    projectId: params.code,
    baseTitle: 'Ponudba',
    versionNumber: 1,
    title: 'Ponudba_1',
    totalNet: 0,
    status: 'accepted',
    // Namenoma ne uporabimo ??: acceptedAt: null pomeni "brez datuma", ne "privzeti".
    acceptedAt: params.acceptedAt === undefined ? new Date('2026-07-10T10:00:00Z') : params.acceptedAt,
    items: params.items.map((item, index) => {
      const totalNet = item.quantity * item.unitPrice;
      return {
        id: `i${index}`,
        productId: String(item.productId),
        name: item.name,
        quantity: item.quantity,
        unit: 'kos',
        unitPrice: item.unitPrice,
        discountPercent: 0,
        vatRate: 22,
        totalNet,
        totalVat: totalNet * 0.22,
        totalGross: totalNet * 1.22,
      };
    }),
  });
  await ProjectModel.create({
    id: params.code,
    code: params.code,
    projectNumber: params.num,
    title: `${params.code}: Videonadzor`,
    customer: { name: 'Stranka' },
    status: params.status ?? 'in-progress',
    createdAt: new Date().toISOString(),
    confirmedOfferVersionId: String(offer._id),
    assignedEmployeeIds: params.assigned,
  });
  return offer;
}

test('napoved sesteje storitve po monterjevi ceni; material se ne steje', async () => {
  await withMongo(async () => {
    const montaza = await createService('Montaža kamere', 100);
    const kamera = await createMaterial('Kamera', 200);
    await EmployeeServiceRateModel.create({
      employeeId: MONTER_A,
      serviceProductId: montaza._id,
      defaultPercent: 40,
      overridePrice: null,
    });

    await createConfirmedProject({
      code: 'PRJ-1',
      num: 1,
      assigned: [MONTER_A],
      items: [
        { productId: montaza._id as any, name: 'Montaža kamere', quantity: 3, unitPrice: 100 },
        { productId: kamera._id as any, name: 'Kamera', quantity: 3, unitPrice: 200 },
      ],
    });

    const forecast = await getEarningsForecast(String(MONTER_A));
    // 3 x 100 EUR x 40 % = 120 EUR; material (3 x 200) se NE steje.
    assert.equal(forecast.totalEarnings, 120);
    assert.equal(forecast.projects.length, 1);
    assert.equal(forecast.projects[0].sharedBetween, 1);
  });
});

test('fiksna cena (overridePrice) povozi odstotek', async () => {
  await withMongo(async () => {
    const montaza = await createService('Montaža kamere', 100);
    await EmployeeServiceRateModel.create({
      employeeId: MONTER_A,
      serviceProductId: montaza._id,
      defaultPercent: 40,
      overridePrice: 25,
    });
    await createConfirmedProject({
      code: 'PRJ-2',
      num: 2,
      assigned: [MONTER_A],
      items: [{ productId: montaza._id as any, name: 'Montaža kamere', quantity: 4, unitPrice: 100 }],
    });

    const forecast = await getEarningsForecast(String(MONTER_A));
    assert.equal(forecast.totalEarnings, 100, '4 x 25 EUR fiksno, ne 4 x 40 EUR');
  });
});

test('zasluzek se razdeli med dodeljene monterje in vsak vidi samo svoj delez', async () => {
  await withMongo(async () => {
    const montaza = await createService('Montaža kamere', 100);
    await EmployeeServiceRateModel.create({ employeeId: MONTER_A, serviceProductId: montaza._id, defaultPercent: 40, overridePrice: null });
    await EmployeeServiceRateModel.create({ employeeId: MONTER_B, serviceProductId: montaza._id, defaultPercent: 50, overridePrice: null });

    await createConfirmedProject({
      code: 'PRJ-3',
      num: 3,
      assigned: [MONTER_A, MONTER_B],
      items: [{ productId: montaza._id as any, name: 'Montaža kamere', quantity: 2, unitPrice: 100 }],
    });

    const a = await getEarningsForecast(String(MONTER_A));
    const b = await getEarningsForecast(String(MONTER_B));
    // A: 2 x 100 x 40 % = 80, deljeno z 2 = 40. B po SVOJI ceni: 2 x 100 x 50 % = 100 / 2 = 50.
    assert.equal(a.totalEarnings, 40);
    assert.equal(b.totalEarnings, 50);
    assert.equal(a.projects[0].sharedBetween, 2);
  });
});

test('steje samo potrjeno in se ne zaracunano, kjer je monter dodeljen', async () => {
  await withMongo(async () => {
    const montaza = await createService('Montaža kamere', 100);
    await EmployeeServiceRateModel.create({ employeeId: MONTER_A, serviceProductId: montaza._id, defaultPercent: 40, overridePrice: null });
    const items = [{ productId: montaza._id as any, name: 'Montaža kamere', quantity: 1, unitPrice: 100 }];

    await createConfirmedProject({ code: 'PRJ-4', num: 4, assigned: [MONTER_A], items });
    await createConfirmedProject({ code: 'PRJ-5', num: 5, assigned: [MONTER_A], items, status: 'invoiced' });
    await createConfirmedProject({ code: 'PRJ-6', num: 6, assigned: [MONTER_B], items });
    // Projekt brez potrjene ponudbe.
    await ProjectModel.create({
      id: 'PRJ-7', code: 'PRJ-7', projectNumber: 7, title: 'PRJ-7', customer: { name: 'X' },
      status: 'offered', createdAt: new Date().toISOString(), confirmedOfferVersionId: null,
      assignedEmployeeIds: [MONTER_A],
    });

    const forecast = await getEarningsForecast(String(MONTER_A));
    assert.deepEqual(forecast.projects.map((p) => p.code), ['PRJ-4'], 'zaracunan, tuj in nepotrjen izpadejo');
    assert.equal(forecast.totalEarnings, 40);
  });
});

test('meseci se sestejejo po datumu potrditve; brez datuma gre v svojo skupino', async () => {
  await withMongo(async () => {
    const montaza = await createService('Montaža kamere', 100);
    await EmployeeServiceRateModel.create({ employeeId: MONTER_A, serviceProductId: montaza._id, defaultPercent: 50, overridePrice: null });
    const items = [{ productId: montaza._id as any, name: 'Montaža kamere', quantity: 1, unitPrice: 100 }];

    await createConfirmedProject({ code: 'PRJ-8', num: 8, assigned: [MONTER_A], items, acceptedAt: new Date('2026-07-05T08:00:00Z') });
    await createConfirmedProject({ code: 'PRJ-9', num: 9, assigned: [MONTER_A], items, acceptedAt: new Date('2026-07-20T08:00:00Z') });
    await createConfirmedProject({ code: 'PRJ-10', num: 10, assigned: [MONTER_A], items, acceptedAt: new Date('2026-08-02T08:00:00Z') });
    await createConfirmedProject({ code: 'PRJ-11', num: 11, assigned: [MONTER_A], items, acceptedAt: null });

    const forecast = await getEarningsForecast(String(MONTER_A));
    const julij = forecast.months.find((m) => m.month === '2026-07');
    assert.equal(julij?.earnings, 100, 'dva julijska projekta po 50 EUR');
    assert.equal(julij?.projectCount, 2);
    assert.equal(julij?.label, 'julij 2026');
    assert.equal(forecast.months.find((m) => m.month === '2026-08')?.earnings, 50);
    assert.equal(forecast.months.find((m) => m.month === null)?.label, 'Brez datuma potrditve');
    assert.equal(forecast.totalEarnings, 200);
  });
});

test('storitev brez nastavljene cene se posebej javi, da zasluzek ni tiho podcenjen', async () => {
  await withMongo(async () => {
    const montaza = await createService('Montaža kamere', 100);
    const zagon = await createService('Zagon snemalnika', 80);
    await EmployeeServiceRateModel.create({ employeeId: MONTER_A, serviceProductId: montaza._id, defaultPercent: 40, overridePrice: null });

    await createConfirmedProject({
      code: 'PRJ-12',
      num: 12,
      assigned: [MONTER_A],
      items: [
        { productId: montaza._id as any, name: 'Montaža kamere', quantity: 1, unitPrice: 100 },
        { productId: zagon._id as any, name: 'Zagon snemalnika', quantity: 1, unitPrice: 80 },
      ],
    });

    const forecast = await getEarningsForecast(String(MONTER_A));
    assert.equal(forecast.totalEarnings, 40, 'steje samo storitev z nastavljeno ceno');
    assert.deepEqual(forecast.projects[0].servicesWithoutRate, ['Zagon snemalnika']);
  });
});

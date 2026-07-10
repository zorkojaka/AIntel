import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProductModel } from '../modules/cenik/product.model';
import { predlagajDisk, predlagajPoESwitch } from '../modules/zahteve/zahteva.service';

// AIN-P1-16: strežniške predloge morajo med enako ustreznimi produkti izbrati
// najpogosteje prodanega (lastna statistika), ne najcenejšega.

function baseProduct(overrides: Record<string, unknown>) {
  return {
    ime: 'test',
    kategorija: 'test',
    nabavnaCena: 10,
    prodajnaCena: 20,
    isActive: true,
    ...overrides,
  };
}

test('AIN-P1-16 predlogi upoštevajo prodajno statistiko', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'predlogi-sales-test' });

  t.after(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('disk: enaka kapaciteta → zmaga najbolj prodan, ne najcenejši', async () => {
    await ProductModel.create([
      baseProduct({
        ime: 'Disk A (cenejši, neprodajan)',
        prodajnaCena: 50,
        classification: { productType: 'disk', diskCapacityTB: 4, isSurveillanceDisk: true },
      }),
      baseProduct({
        ime: 'Disk B (dražji, najbolj prodan)',
        prodajnaCena: 60,
        classification: { productType: 'disk', diskCapacityTB: 4, isSurveillanceDisk: true },
        salesStats: { soldQty: 12, soldQty365: 9, offersCount: 6, computedAt: new Date() },
      }),
    ]);
    const predlog = await predlagajDisk(4, true);
    assert.match(String(predlog?.ime), /najbolj prodan/);
  });

  await t.test('disk: manjša ustrezna kapaciteta ima še vedno prednost pred prodajo večje', async () => {
    await ProductModel.create(
      baseProduct({
        ime: 'Disk C (večji, zelo prodan)',
        prodajnaCena: 90,
        classification: { productType: 'disk', diskCapacityTB: 8, isSurveillanceDisk: true },
        salesStats: { soldQty: 99, soldQty365: 99, offersCount: 30, computedAt: new Date() },
      }),
    );
    const predlog = await predlagajDisk(4, true);
    assert.match(String(predlog?.ime), /najbolj prodan/); // še vedno 4TB zmagovalec
  });

  await t.test('switch: enako število portov → najbolj prodan', async () => {
    await ProductModel.create([
      baseProduct({
        ime: 'Switch A (cenejši)',
        prodajnaCena: 40,
        classification: { productType: 'switch', poePortCount: 8, switchSpeed: 'gigabit' },
      }),
      baseProduct({
        ime: 'Switch B (prodajan)',
        prodajnaCena: 55,
        classification: { productType: 'switch', poePortCount: 8, switchSpeed: 'gigabit' },
        salesStats: { soldQty: 4, soldQty365: 4, offersCount: 3, computedAt: new Date() },
      }),
    ]);
    const predlog = await predlagajPoESwitch(6);
    assert.match(String(predlog?.ime), /prodajan/);
  });
});

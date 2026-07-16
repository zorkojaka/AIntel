import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { CrmClientModel } from '../modules/crm/schemas/client';
import { resolveOrCreateProjectClient } from '../modules/projects/controllers/project.controller';

async function withMongo(fn: () => Promise<void>) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_autolink' });
  try {
    await fn();
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

test('projekt s samim nazivom stranke ustvari stranko', async () => {
  await withMongo(async () => {
    const clientId = await resolveOrCreateProjectClient(undefined, { name: 'Stane Vir pri stični' });
    assert.ok(clientId, 'projekt dobi stranko, tudi ce imamo samo naziv');

    const client = await CrmClientModel.findById(clientId).lean();
    assert.equal(client?.name, 'Stane Vir pri stični');
    assert.equal(client?.type, 'individual', 'brez davcne stevilke = fizicna oseba');
  });
});

test('davcna stevilka pomeni podjetje', async () => {
  await withMongo(async () => {
    const clientId = await resolveOrCreateProjectClient(null, {
      name: 'ARDOR LES D.O.O.',
      taxId: 'SI12345678',
      address: 'Testna 1, Ljubljana',
    });
    const client = await CrmClientModel.findById(clientId).lean();
    assert.equal(client?.type, 'company');
    assert.equal(client?.vat_number, 'SI12345678');
    assert.equal(client?.address, 'Testna 1, Ljubljana');
  });
});

test('drugi projekt iste stranke uporabi obstojeco stranko, ne ustvari nove', async () => {
  await withMongo(async () => {
    const prvi = await resolveOrCreateProjectClient(undefined, { name: 'Andy Vodopivec' });
    // Isto ime, drugacna velikost crk in presledki — se vedno ISTA stranka.
    const drugi = await resolveOrCreateProjectClient(undefined, { name: '  andy vodopivec ' });

    assert.equal(String(prvi), String(drugi), 'ista stranka ima vec projektov');
    assert.equal(await CrmClientModel.countDocuments({}), 1, 'podvojena stranka ne nastane');
  });
});

test('izrecno izbrana stranka ima prednost pred iskanjem po imenu', async () => {
  await withMongo(async () => {
    const izbrana = await CrmClientModel.create({ name: 'Prava stranka', type: 'individual' });
    await CrmClientModel.create({ name: 'Napacno ime', type: 'individual' });

    const resolved = await resolveOrCreateProjectClient(String(izbrana._id), { name: 'Napacno ime' });
    assert.equal(String(resolved), String(izbrana._id));
    assert.equal(await CrmClientModel.countDocuments({}), 2, 'nova stranka ne nastane');
  });
});

test('brez naziva stranke projekt ostane brez nje, neveljaven ID pa javi napako', async () => {
  await withMongo(async () => {
    assert.equal(await resolveOrCreateProjectClient(undefined, { name: '   ' }), null);
    assert.equal(await resolveOrCreateProjectClient(undefined, undefined), null);
    assert.equal(await CrmClientModel.countDocuments({}), 0, 'prazna stranka ne nastane');

    await assert.rejects(() => resolveOrCreateProjectClient('ni-objectid', { name: 'X' }), /Neveljaven ID stranke/);
    await assert.rejects(
      () => resolveOrCreateProjectClient(new mongoose.Types.ObjectId().toString(), { name: 'X' }),
      /Izbrana stranka ne obstaja/,
    );
  });
});

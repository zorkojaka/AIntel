import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ProductModel } from '../modules/cenik/product.model';
import { applyProductImportFromItems } from '../modules/cenik/services/product-sync.service';

function aaRow(id: string, name: string, price: number, description: string) {
  return {
    externalSource: 'aa_api',
    externalId: id,
    externalKey: `aa_api:${id}`,
    ime: name,
    kategorija: 'kamera',
    categorySlugs: ['kamera'],
    purchasePriceWithoutVat: price / 2,
    nabavnaCena: price / 2,
    prodajnaCena: price,
    kratekOpis: description,
    dolgOpis: description,
    povezavaDoSlike: `https://example.test/${id}.jpg`,
    povezavaDoProdukta: `https://example.test/${id}`,
    proizvajalec: 'AA',
    dobavitelj: 'Alarm Automatika d.o.o.',
    naslovDobavitelja: 'Letališka cesta 32, 1000 Ljubljana',
    isService: false,
    aaData: { productCode: name, rawDescription: description, stock: '5' },
    classification: { productType: 'kamera' },
    __providedFields: [
      'externalSource', 'externalId', 'externalKey', 'ime', 'kategorija', 'categorySlugs',
      'purchasePriceWithoutVat', 'nabavnaCena', 'prodajnaCena', 'kratekOpis', 'dolgOpis',
      'povezavaDoSlike', 'povezavaDoProdukta', 'proizvajalec', 'dobavitelj',
      'naslovDobavitelja', 'isService', 'aaData', 'classification',
    ],
  };
}

test('AA selektivni uvoz ohrani prilagojene opise in uporabi samo izbrane produkte ter polja', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_product_sync_selection' });
  try {
    await ProductModel.create({
      ...aaRow('100', 'Prilagojeno ime', 100, 'Prilagojen opis za stranko'),
      prodajnaCena: 100,
      kratekOpis: 'Prilagojen kratek opis',
      dolgOpis: 'Prilagojen dolg opis',
    });

    const result = await applyProductImportFromItems({
      source: 'aa_api',
      items: [
        aaRow('100', 'AA surovo ime', 120, 'AA surovi opis'),
        aaRow('200', 'Izbrani novi produkt', 80, 'Opis novega produkta'),
        aaRow('300', 'Neizbrani novi produkt', 90, 'Ne sme se uvoziti'),
      ],
      selection: {
        createExternalKeys: ['aa_api:200'],
        updateExternalKeys: ['aa_api:100'],
        createFields: ['povezavaDoSlike', 'aaData'],
        updateFields: ['purchasePriceWithoutVat', 'nabavnaCena', 'prodajnaCena'],
      },
    });

    const existing = await ProductModel.findOne({ externalKey: 'aa_api:100' }).lean();
    assert.equal(existing?.ime, 'Prilagojeno ime');
    assert.equal(existing?.kratekOpis, 'Prilagojen kratek opis');
    assert.equal(existing?.dolgOpis, 'Prilagojen dolg opis');
    assert.equal(existing?.prodajnaCena, 120);
    assert.ok(existing?.sourceImportedAt);
    assert.ok(existing?.sourceLastSyncedAt);

    const selectedNew = await ProductModel.findOne({ externalKey: 'aa_api:200' }).lean();
    assert.equal(selectedNew?.ime, 'Izbrani novi produkt');
    assert.equal(selectedNew?.kratekOpis, '');
    assert.equal(selectedNew?.povezavaDoSlike, 'https://example.test/200.jpg');
    assert.ok(selectedNew?.sourceImportedAt);

    assert.equal(await ProductModel.countDocuments({ externalKey: 'aa_api:300' }), 0);
    assert.equal(result.applied.createdCount, 1);
    assert.equal(result.applied.updatedCount, 1);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

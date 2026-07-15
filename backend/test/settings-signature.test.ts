import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { getSettings, updateSettings } from '../modules/settings/settings.service';

const PODPIS = 'data:image/png;base64,PODPIS';
const ZIG = 'data:image/png;base64,ZIG';

async function withMongo(fn: () => Promise<void>) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'aintel_settings_signature' });
  try {
    await fn();
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

test('podpis, zig in kljukica se shranijo in preberejo nazaj', async () => {
  await withMongo(async () => {
    const saved = await updateSettings({
      directorName: 'Jaka Zorko',
      signatureUrl: PODPIS,
      stampUrl: ZIG,
      useStamp: true,
    } as any);

    assert.equal(saved.directorName, 'Jaka Zorko');
    assert.equal(saved.signatureUrl, PODPIS);
    assert.equal(saved.stampUrl, ZIG);
    assert.equal(saved.useStamp, true);

    // sanitizeSettings je eksplicitni seznam polj — kar ni na njem, se ob branju izgubi.
    const reread = await getSettings(true);
    assert.equal(reread.signatureUrl, PODPIS, 'podpis prezivi branje iz baze');
    assert.equal(reread.stampUrl, ZIG);
    assert.equal(reread.useStamp, true);
  });
});

test('kljukico je mogoce izklopiti, slika ziga pa ostane shranjena', async () => {
  await withMongo(async () => {
    await updateSettings({ signatureUrl: PODPIS, stampUrl: ZIG, useStamp: true } as any);
    const updated = await updateSettings({ useStamp: false } as any);

    assert.equal(updated.useStamp, false, 'false se ne sme obravnavati kot "ni podano"');
    assert.equal(updated.stampUrl, ZIG, 'slika ziga se ohrani za poznejsi vklop');
    assert.equal(updated.signatureUrl, PODPIS);
  });
});

test('delna posodobitev ne pobrise podpisa in ziga', async () => {
  await withMongo(async () => {
    await updateSettings({ signatureUrl: PODPIS, stampUrl: ZIG, useStamp: true } as any);
    const updated = await updateSettings({ companyName: 'Inteligent d.o.o.' } as any);

    assert.equal(updated.companyName, 'Inteligent d.o.o.');
    assert.equal(updated.signatureUrl, PODPIS);
    assert.equal(updated.stampUrl, ZIG);
    assert.equal(updated.useStamp, true);
  });
});

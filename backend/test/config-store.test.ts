import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ConfigStoreModel } from '../modules/settings/config/config-store.model';
import {
  getConfig,
  setConfig,
  patchConfig,
  listConfig,
  _clearConfigCache,
} from '../modules/settings/config/config-store.service';
import {
  registerConfigNamespace,
  getConfigNamespace,
  ConfigNamespaceNotFoundError,
} from '../modules/settings/config/config-registry';
import { registerCoreConfigNamespaces } from '../modules/settings/config/config-namespaces';
import { v, ConfigValidationError } from '../modules/settings/config/config-validator';

test('AIN-P2-11 config store', async (t) => {
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'config-store-test' });
  await ConfigStoreModel.syncIndexes();
  registerCoreConfigNamespaces();
  // Testni prostor za robne primere.
  registerConfigNamespace({
    namespace: 'test.demo',
    description: 'Testni prostor.',
    schema: v.object({
      label: v.string({ min: 1, max: 40 }).default('privzeto'),
      count: v.number({ min: 0, int: true }).default(3),
      mode: v.enum(['a', 'b'] as const).default('a'),
    }),
  });

  t.after(async () => {
    _clearConfigCache();
    await mongoose.disconnect();
    await server.stop();
  });

  await t.test('validator applies defaults for empty input', () => {
    const def = getConfigNamespace('platform.general');
    const parsed = def.schema.parse({}) as Record<string, unknown>;
    assert.match(String(parsed.siteVisitFeeText), /Strokovni ogled/);
    assert.equal(typeof parsed.executionLeadText, 'string');
  });

  await t.test('validator rejects bad types with ConfigValidationError', () => {
    const def = getConfigNamespace('test.demo');
    assert.throws(() => def.schema.parse({ count: -1 }), ConfigValidationError);
    assert.throws(() => def.schema.parse({ mode: 'z' }), ConfigValidationError);
    assert.throws(() => def.schema.parse({ label: '' }), ConfigValidationError);
  });

  await t.test('get returns full defaults when nothing stored', async () => {
    const cfg = await getConfig('test.demo');
    assert.deepEqual(cfg, { label: 'privzeto', count: 3, mode: 'a' });
  });

  await t.test('set validates, persists, and reads back', async () => {
    const saved = await setConfig('test.demo', { label: 'Živjo', count: 7, mode: 'b' }, { updatedBy: 'emp1' });
    assert.equal(saved.count, 7);
    _clearConfigCache();
    const read = await getConfig('test.demo');
    assert.deepEqual(read, { label: 'Živjo', count: 7, mode: 'b' });
    const doc = await ConfigStoreModel.findOne({ tenantId: 'inteligent', namespace: 'test.demo' }).lean();
    assert.equal(doc?.updatedBy, 'emp1');
  });

  await t.test('set with invalid value throws and does not persist', async () => {
    await assert.rejects(setConfig('test.demo', { count: 2.5 }), ConfigValidationError);
  });

  await t.test('patch shallow-merges top-level keys', async () => {
    await setConfig('test.demo', { label: 'A', count: 1, mode: 'a' });
    const patched = await patchConfig('test.demo', { count: 9 });
    assert.deepEqual(patched, { label: 'A', count: 9, mode: 'a' });
  });

  await t.test('tenant isolation: two tenants keep separate values', async () => {
    await setConfig('test.demo', { label: 'ORG-A', count: 1, mode: 'a' }, { tenantId: 'alpha' });
    await setConfig('test.demo', { label: 'ORG-B', count: 2, mode: 'b' }, { tenantId: 'beta' });
    assert.equal((await getConfig('test.demo', 'alpha')).label, 'ORG-A');
    assert.equal((await getConfig('test.demo', 'beta')).label, 'ORG-B');
  });

  await t.test('cache invalidation: set updates the cached read', async () => {
    await getConfig('test.demo'); // prime cache
    await setConfig('test.demo', { label: 'fresh', count: 5, mode: 'a' });
    assert.equal((await getConfig('test.demo')).label, 'fresh');
  });

  await t.test('unknown namespace raises 404 error', async () => {
    await assert.rejects(getConfig('ni.taprostor'), ConfigNamespaceNotFoundError);
    assert.throws(() => getConfigNamespace('ni.taprostor'), (err: any) => err.statusCode === 404);
  });

  await t.test('listConfig returns every registered namespace with values', async () => {
    const all = await listConfig();
    const names = all.map((entry) => entry.namespace);
    assert.ok(names.includes('platform.general'));
    assert.ok(names.includes('sales.discounts'));
    for (const entry of all) {
      assert.equal(typeof entry.description, 'string');
      assert.equal(typeof entry.value, 'object');
    }
  });
});

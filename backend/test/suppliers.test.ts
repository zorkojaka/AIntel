import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeSupplierEmails } from '../modules/suppliers/supplier.service';
import { applySupplierOrderToItems } from '../modules/suppliers/supplier-order-email.service';

// Naročanje pri dobaviteljih: čiščenje e-naslovov (natanko en privzeti) in
// označevanje postavk kot naročenih po poslanem naročilu.

test('sanitizeSupplierEmails: veljavni naslovi, brez dvojnikov, natanko en privzeti', () => {
  const emails = sanitizeSupplierEmails([
    { address: 'A@Dobavitelj.si', isDefault: false },
    { address: 'a@dobavitelj.si', isDefault: false },
    { address: 'neveljaven', isDefault: true },
    { address: 'b@dobavitelj.si', isDefault: false },
  ]);
  assert.deepEqual(emails.map((e) => e.address), ['a@dobavitelj.si', 'b@dobavitelj.si']);
  assert.equal(emails.filter((e) => e.isDefault).length, 1);
  assert.equal(emails[0].isDefault, true, 'brez izbranega privzetega postane prvi privzeti');

  const withDefault = sanitizeSupplierEmails([
    { address: 'a@d.si', isDefault: false },
    { address: 'b@d.si', isDefault: true },
  ]);
  assert.equal(withDefault.find((e) => e.isDefault)?.address, 'b@d.si');

  const multiDefault = sanitizeSupplierEmails([
    { address: 'a@d.si', isDefault: true },
    { address: 'b@d.si', isDefault: true },
  ]);
  assert.equal(multiDefault.filter((e) => e.isDefault).length, 1);
  assert.equal(multiDefault[0].isDefault, true);

  assert.deepEqual(sanitizeSupplierEmails('nesmisel'), []);
});

test('applySupplierOrderToItems: izbrane postavke naročene, napredni koraki ostanejo', () => {
  const items: Array<{ id: string; quantity: number; materialStep?: string; orderedQty?: number; isOrdered?: boolean }> = [
    { id: 'a', quantity: 4, materialStep: 'Za naročiti' },
    { id: 'b', quantity: 2, materialStep: 'Prevzeto', orderedQty: 1 },
    { id: 'c', quantity: 3, materialStep: 'Za naročiti' },
  ];
  const next = applySupplierOrderToItems(items, ['a', 'b']);

  assert.equal(next[0].orderedQty, 4);
  assert.equal(next[0].isOrdered, true);
  assert.equal(next[0].materialStep, 'Naročeno');

  assert.equal(next[1].orderedQty, 2, 'orderedQty se poravna na plan');
  assert.equal(next[1].materialStep, 'Prevzeto', 'korak se ne vrača nazaj');

  assert.equal(next[2].orderedQty ?? 0, 0, 'neizbrana postavka ostane nedotaknjena');
  assert.equal(next[2].materialStep, 'Za naročiti');
});

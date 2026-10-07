import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAAProductSourceFingerprint } from '../modules/cenik/sync/aaApiClient';
import type { AAProductRaw } from '../modules/cenik/sync/types';

const first: AAProductRaw = {
  id: '100',
  name: 'Kamera',
  description: 'Opis',
  price: 100,
  stock: '5',
  attributes: [
    { attribute: 'Manufacturer', term: 'Ajax' },
    { attribute: 'Resolution', term: '4 MP' },
  ],
};

const second: AAProductRaw = {
  id: '200',
  name: 'Snemalnik',
  description: 'Opis snemalnika',
  price: 200,
  stock: '2',
  attributes: [{ attribute: 'Channels', term: '8' }],
};

test('AA fingerprint je enak pri drugem vrstnem redu produktov in atributov', () => {
  const reordered: AAProductRaw[] = [
    second,
    { ...first, attributes: [...(first.attributes ?? [])].reverse() },
  ];

  assert.equal(
    buildAAProductSourceFingerprint([first, second]),
    buildAAProductSourceFingerprint(reordered),
  );
});

test('AA fingerprint se spremeni ob dejanski spremembi podatkov', () => {
  const changed: AAProductRaw[] = [{ ...first, price: 101 }, second];

  assert.notEqual(
    buildAAProductSourceFingerprint([first, second]),
    buildAAProductSourceFingerprint(changed),
  );
});

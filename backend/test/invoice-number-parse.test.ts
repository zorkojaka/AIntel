import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocumentNumberSequence, withDocumentLabel } from '../modules/settings/document-numbering.util';

test('sequence is read back from numbers built with the configured pattern', () => {
  const pattern = 'RAČUN {SEQ:000}-{MM}-{YYYY}';
  assert.deepEqual(parseDocumentNumberSequence('RAČUN 089-10-2026', pattern), { sequence: 89, year: 2026 });
  assert.deepEqual(parseDocumentNumberSequence('RAČUN 90-10-2026', pattern), { sequence: 90, year: 2026 });
  assert.deepEqual(parseDocumentNumberSequence('RAČUN 087-10-2026 - Skladišče', pattern), { sequence: 87, year: 2026 });
  assert.deepEqual(parseDocumentNumberSequence('RACUN-26-007', 'RACUN-{YY}-{SEQ:000}'), { sequence: 7, year: 2026 });
  assert.deepEqual(parseDocumentNumberSequence('R-12', 'R-{SEQ}'), { sequence: 12, year: null });
  assert.equal(parseDocumentNumberSequence('PONUDBA 089-10-2026', pattern), null);
  assert.equal(parseDocumentNumberSequence('RAČUN 0891-10-2026x', 'RAČUN {SEQ:000}-{MM}-{YYYY}1'), null);
});

test('document label is added once', () => {
  assert.equal(withDocumentLabel('Račun', '88-10-2026'), 'Račun 88-10-2026');
  assert.equal(withDocumentLabel('Račun', 'RAČUN 090-10-2026'), 'RAČUN 090-10-2026');
});

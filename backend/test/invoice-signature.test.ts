import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDirectorSignatureBlock } from '../modules/projects/services/document-renderers';

const PODPIS = 'data:image/png;base64,PODPIS';
const ZIG = 'data:image/png;base64,ZIG';

function company(overrides: Record<string, unknown> = {}) {
  return {
    companyName: 'Inteligent d.o.o.',
    address: 'Agrokombinatska cesta 12',
    directorName: 'Jaka Zorko',
    ...overrides,
  } as any;
}

test('podpis: slika podpisa in pod njo ime direktorja', () => {
  const html = buildDirectorSignatureBlock(company({ signatureUrl: PODPIS }));
  assert.match(html, /document-signature/);
  assert.match(html, /src="data:image\/png;base64,PODPIS"/);
  assert.match(html, /Jaka Zorko/);
  assert.doesNotMatch(html, /Poslujemo brez žiga/, 'brez kljukice se zig ne omenja');
});

test('kljukica vklopljena + slika ziga: zig se izpise ob podpisu', () => {
  const html = buildDirectorSignatureBlock(company({ signatureUrl: PODPIS, stampUrl: ZIG, useStamp: true }));
  assert.match(html, /src="data:image\/png;base64,ZIG"/);
  assert.match(html, /src="data:image\/png;base64,PODPIS"/);
  assert.doesNotMatch(html, /Poslujemo brez žiga/);
});

test('kljukica vklopljena, slike ziga ni: namesto nje sporocilo', () => {
  const html = buildDirectorSignatureBlock(company({ signatureUrl: PODPIS, stampUrl: '', useStamp: true }));
  assert.match(html, /Poslujemo brez žiga\./);
  assert.match(html, /src="data:image\/png;base64,PODPIS"/, 'podpis ostane');
});

test('kljukica izklopljena: ziga ni, tudi ce je slika nalozena', () => {
  const html = buildDirectorSignatureBlock(company({ signatureUrl: PODPIS, stampUrl: ZIG, useStamp: false }));
  assert.doesNotMatch(html, /base64,ZIG/);
  assert.doesNotMatch(html, /Poslujemo brez žiga/);
});

test('brez podpisa se izpise samo ime direktorja (prostor za rocni podpis)', () => {
  const html = buildDirectorSignatureBlock(company({ signatureUrl: '' }));
  assert.match(html, /document-signature-line/);
  assert.match(html, /Jaka Zorko/);
});

test('brez direktorja, podpisa in ziga se blok sploh ne izrise', () => {
  assert.equal(buildDirectorSignatureBlock(company({ directorName: '', signatureUrl: '', useStamp: false })), '');
  assert.equal(buildDirectorSignatureBlock(undefined), '');
});

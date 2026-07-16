import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  izracunajMere,
  NAJVECJA_DOLZINA_DATA_URL,
  NAJVECJA_STRANICA_PX,
} from '../../shared/utils/image-size';

test('velika slika se pomanjsa in ohrani razmerje stranic', () => {
  const mere = izracunajMere(4000, 3000, 1000);
  assert.deepEqual(mere, { sirina: 1000, visina: 750 });
});

test('visoka slika se omeji po visini', () => {
  const mere = izracunajMere(1500, 3000, 1000);
  assert.deepEqual(mere, { sirina: 500, visina: 1000 });
});

test('majhne slike pustimo pri miru (povecevanje bi kakovost poslabsalo)', () => {
  assert.deepEqual(izracunajMere(300, 120, 1000), { sirina: 300, visina: 120 });
});

test('slika tocno na meji ostane nespremenjena', () => {
  assert.deepEqual(izracunajMere(1000, 400, 1000), { sirina: 1000, visina: 400 });
});

test('nesmiselne mere ne razbijejo nalaganja', () => {
  assert.deepEqual(izracunajMere(0, 0), { sirina: 0, visina: 0 });
  assert.deepEqual(izracunajMere(Number.NaN, 100), { sirina: 0, visina: 0 });
});

test('privzeta meja je dovolj majhna, da podpis ne napihne zahtevka', () => {
  assert.ok(NAJVECJA_STRANICA_PX <= 1000);
});

test('meja slike ostane krepko pod 1 MB, ki jih prepusti nginx', () => {
  assert.ok(NAJVECJA_DOLZINA_DATA_URL < 1_000_000);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSelectedNotes } from '../modules/projects/services/offer-pdf-preview.service';

const settings = {
  notes: [
    { id: 'n1', title: 'Garancija', text: 'Garancija 2 leti.', category: 'note', sortOrder: 0 },
    { id: 'n2', title: 'Dostava', text: 'Dostava v 14 dneh.', category: 'delivery', sortOrder: 1 },
    { id: 'n3', title: 'Avans', text: 'Avans 50 % ob potrditvi.', category: 'payment', sortOrder: 2 },
  ],
  noteDefaultsByDoc: { offer: ['n1', 'n2'], invoice: ['n1'] },
} as any;

const pdfSettings = {
  defaultTexts: { paymentTerms: 'Plačilo v 15 dneh.', disclaimer: 'Pridržujemo si pravico do sprememb.' },
} as any;

test('ponudba brez lastnega izbora: v nogo gredo privzete opombe', () => {
  const notes = buildSelectedNotes(settings, 'OFFER', pdfSettings, {}, null);
  assert.deepEqual(notes, ['Garancija 2 leti.', 'Dostava v 14 dneh.']);
});

test('ponudba z lastnim izborom: velja izbor s ponudbe, neznani id-ji se ignorirajo', () => {
  const notes = buildSelectedNotes(settings, 'OFFER', pdfSettings, {}, ['n3', 'n1', 'izbrisana']);
  assert.deepEqual(notes, ['Avans 50 % ob potrditvi.', 'Garancija 2 leti.']);
});

test('ponudba s praznim izborom: noga ostane prazna', () => {
  const notes = buildSelectedNotes(settings, 'OFFER', pdfSettings, {}, []);
  assert.deepEqual(notes, []);
});

test('ponudba: plačilni pogoji se NE podvajajo v nogi (izpišejo se v glavi kot Rok plačila)', () => {
  const notes = buildSelectedNotes(
    settings,
    'OFFER',
    pdfSettings,
    { paymentTerms: 'Avans 50 % ob potrditvi.' },
    null,
  );
  assert.ok(!notes.includes('Avans 50 % ob potrditvi.'));
});

test('drugi dokumenti: privzete opombe + plačilni pogoji v nogi (nespremenjeno vedenje)', () => {
  const notes = buildSelectedNotes(settings, 'INVOICE', pdfSettings, {}, null);
  assert.deepEqual(notes, [
    'Garancija 2 leti.',
    'Plačilo v 15 dneh.',
    'Pridržujemo si pravico do sprememb.',
  ]);
});

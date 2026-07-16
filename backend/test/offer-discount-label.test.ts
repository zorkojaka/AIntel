import assert from 'node:assert/strict';
import test from 'node:test';

import { renderOfferPdf } from '../modules/projects/services/document-renderers';

function ponudba(totals: Record<string, unknown>, usePerItemDiscount = false) {
  const html = renderOfferPdf({
    docType: 'OFFER',
    documentNumber: 'PONUDBA-2026-001',
    issueDate: '15. 7. 2026',
    company: { companyName: 'Inteligent d.o.o.', primaryColor: '#0f62fe' },
    items: [{ name: 'Kamera', quantity: 1, unitPrice: 159, total: 159 }],
    usePerItemDiscount,
    totals,
  } as any);
  return html.replace(/\s+/g, ' ');
}

test('ponudba: oznaka popusta pokaze odstotek', () => {
  const html = ponudba({ subtotal: 265.96, discount: 26.6, discountPercent: 10, subtotalAfterDiscount: 239.36, vat: 52.66, total: 292.02 });
  assert.match(html, /Popust \(10 %\)/);
});

test('ponudba: brez odstotka ostane stara oznaka', () => {
  const html = ponudba({ subtotal: 265.96, discount: 26.6, discountPercent: 0, subtotalAfterDiscount: 239.36, vat: 52.66, total: 292.02 });
  assert.match(html, /Popust</, 'golo "Popust" brez odstotka');
  assert.doesNotMatch(html, /Popust \(/);
});

test('ponudba: brez popusta se vrstica sploh ne izpise', () => {
  const html = ponudba({ subtotal: 265.96, discount: 0, discountPercent: 0, subtotalAfterDiscount: 265.96, vat: 58.51, total: 324.47 });
  assert.doesNotMatch(html, /Popust/);
});

test('ponudba z OBEMA popustoma: odstotka NI, ker znesek vsebuje tudi popuste po postavkah', () => {
  // PRJ-111 je tak primer: globalni 3 % + popusti po postavkah. Odstotek ob
  // sestevku obeh bi bil zavajajoc, zato ostane gola oznaka.
  const html = ponudba(
    { subtotal: 1000, discount: 130, discountPercent: 0, subtotalAfterDiscount: 870, vat: 191.4, total: 1061.4 },
    true,
  );
  assert.doesNotMatch(html, /Popust \(/);
  assert.match(html, /Popust</);
});

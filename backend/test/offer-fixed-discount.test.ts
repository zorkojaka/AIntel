import assert from 'node:assert/strict';
import test from 'node:test';

import { renderInvoicePdf, renderOfferPdf } from '../modules/projects/services/document-renderers';
import { calculateOfferTotals } from '../modules/projects/services/offer-totals.service';

const item = {
  id: 'item-1',
  productId: null,
  name: 'Storitev',
  quantity: 2,
  unit: 'kos',
  unitPrice: 100,
  vatRate: 22,
  discountPercent: 10,
  totalNet: 180,
  totalVat: 39.6,
  totalGross: 219.6,
};

test('fixed discount is applied after item and percentage discounts and before VAT', () => {
  const totals = calculateOfferTotals({
    items: [item],
    usePerItemDiscount: true,
    useGlobalDiscount: true,
    globalDiscountPercent: 10,
    fixedDiscountAmount: 50,
    vatMode: 22,
  });

  assert.equal(totals.perItemDiscountAmount, 20);
  assert.equal(totals.globalDiscountAmount, 18);
  assert.equal(totals.fixedDiscountAmount, 50);
  assert.equal(totals.baseAfterDiscount, 112);
  assert.equal(totals.vatAmount, 24.64);
  assert.equal(totals.totalWithVat, 136.64);
});

test('fixed discount is capped at the remaining taxable base', () => {
  const totals = calculateOfferTotals({
    items: [item],
    usePerItemDiscount: false,
    useGlobalDiscount: false,
    globalDiscountPercent: 0,
    fixedDiscountAmount: 500,
    vatMode: 22,
  });

  assert.equal(totals.fixedDiscountAmount, 200);
  assert.equal(totals.baseAfterDiscount, 0);
  assert.equal(totals.totalWithVat, 0);
});

test('offer PDF lists discounts separately and hides a zero fixed discount', () => {
  const baseContext = {
    docType: 'OFFER' as const,
    documentNumber: 'P-1',
    issueDate: '13. 8. 2026',
    company: { companyName: 'Inteligent d.o.o.', address: 'Testna 1, Ljubljana' },
    items: [],
  };
  const html = renderOfferPdf({
    ...baseContext,
    totals: {
      subtotal: 200,
      perItemDiscount: 20,
      globalDiscount: 18,
      globalDiscountPercent: 10,
      fixedDiscount: 50,
      subtotalAfterDiscount: 112,
      vat: 24.64,
      total: 136.64,
    },
  });

  assert.match(html, /Popust po produktih/);
  assert.match(html, /Popust na celotno ponudbo \(10%\)/);
  assert.match(html, /Fiksni popust/);

  const zeroHtml = renderOfferPdf({
    ...baseContext,
    totals: { subtotal: 200, fixedDiscount: 0, subtotalAfterDiscount: 200, vat: 44, total: 244 },
  });
  assert.doesNotMatch(zeroHtml, /Fiksni popust/);
});

test('invoice PDF keeps the transferred fixed discount as a separate row', () => {
  const html = renderInvoicePdf({
    docType: 'INVOICE',
    documentNumber: '1/8/2026',
    issueDate: '13. 8. 2026',
    company: { companyName: 'Inteligent d.o.o.', address: 'Testna 1, Ljubljana' },
    items: [],
    totals: {
      subtotal: 200,
      fixedDiscount: 50,
      subtotalAfterDiscount: 150,
      vat: 33,
      total: 183,
    },
  });

  assert.match(html, /Fiksni popust/);
  assert.match(html, /Cena s popustom brez DDV/);
});

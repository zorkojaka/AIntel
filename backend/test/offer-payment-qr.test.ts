import assert from 'node:assert/strict';
import test from 'node:test';

import { renderOfferPdf } from '../modules/projects/services/document-renderers';
import { buildPaymentInfo, buildUpnQrPayload } from '../modules/projects/services/payment-qr.service';

const seed = {
  recipient: 'Inteligent d.o.o.',
  iban: 'SI56191000012345678',
  amount: 122,
  reference: 'PONUDBA-2026-001',
  purpose: 'Plačilo ponudbe PONUDBA-2026-001',
};

test('QR ponudbe vsebuje plačilne podatke in znesek z dvema decimalkama', () => {
  assert.equal(
    buildUpnQrPayload(seed),
    [
      'UPNQR',
      'Inteligent d.o.o.',
      'SI56191000012345678',
      '122.00',
      'PONUDBA-2026-001',
      'Plačilo ponudbe PONUDBA-2026-001',
    ].join('\n'),
  );
});

test('za popolne podatke se ustvari QR slika', async () => {
  const paymentInfo = await buildPaymentInfo(seed);
  assert.match(paymentInfo.qrCodeDataUri ?? '', /^data:image\/png;base64,/);
  assert.equal(paymentInfo.notice, null);
});

test('ponudba izriše QR kodo in vse plačilne podatke', () => {
  const html = renderOfferPdf({
    docType: 'OFFER',
    documentNumber: seed.reference,
    issueDate: '1. 10. 2026',
    company: { companyName: seed.recipient, address: 'Ljubljana', iban: seed.iban },
    totals: { total: seed.amount },
    paymentInfo: { ...seed, qrCodeDataUri: 'data:image/png;base64,QR' },
  });

  assert.match(html, /QR koda za plačilo/);
  assert.match(html, /Podatki za plačilo/);
  assert.match(html, /SI56191000012345678/);
  assert.match(html, /PONUDBA-2026-001/);
  assert.match(html, /122,00/);
});

import fs from 'fs';
import path from 'path';
import { renderHtmlToPdf } from '../modules/projects/services/html-pdf.service';
import type { DocumentNumberingKind } from '../modules/projects/services/document-numbering.service';
import { renderDocumentHtml, type DocumentPreviewContext } from '../modules/projects/services/document-renderers';

const DOC_TYPES: DocumentNumberingKind[] = [
  'INVOICE',
  'PURCHASE_ORDER',
  'DELIVERY_NOTE',
  'WORK_ORDER',
  'WORK_ORDER_CONFIRMATION',
  'CREDIT_NOTE',
];

function buildBaseContext(): Omit<DocumentPreviewContext, 'docType'> {
  return {
    documentNumber: 'DEMO-001',
    issueDate: new Date().toLocaleDateString('sl-SI'),
    validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    paymentTerms: 'Plačilo v 15 dneh.',
    company: {
      companyName: 'Demo podjetje d.o.o.',
      address: 'Glavna cesta 1\n1000 Ljubljana',
      email: 'info@demo.si',
      phone: '+386 1 123 45 67',
      vatId: 'SI12345678',
      iban: 'SI56 0201 2003 4567 890',
      directorName: 'Janez Novak',
      logoUrl: '',
      primaryColor: '#0f62fe',
      website: 'https://demo.si',
    },
    customer: {
      name: 'Stranka d.o.o.',
      address: 'Industrijska cesta 99, 2000 Maribor',
      taxId: 'SI87654321',
    },
    projectTitle: 'Demo projekt',
    items: [
      { name: 'LED panel 60x60', quantity: 12, unit: 'kos', unitPrice: 85, total: 1020, vatPercent: 22 },
      { name: 'Montaža in konfiguracija', quantity: 8, unit: 'h', unitPrice: 45, total: 360, vatPercent: 22 },
    ],
    totals: {
      subtotal: 1380,
      discount: 0,
      vat: 303.6,
      total: 1683.6,
      dueDays: 8,
    },
    notes: ['Plačilo v 15 dneh.', 'V primeru sprememb nas obvestite.'],
    comment: 'To je predstavitveni PDF, generiran v CI.',
  };
}

function buildContextFor(docType: DocumentNumberingKind): DocumentPreviewContext {
  const base = buildBaseContext();
  switch (docType) {
    case 'INVOICE':
      return {
        ...base,
        docType,
        dueDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toLocaleDateString('sl-SI'),
        paymentInfo: {
          recipient: base.company.companyName,
          iban: base.company.iban,
          amount: base.totals?.total ?? 0,
          reference: base.documentNumber,
          purpose: `Plačilo računa ${base.documentNumber}`,
          qrCodeDataUri: null,
          notice: 'Demo QR',
        },
      };
    case 'CREDIT_NOTE':
      return {
        ...base,
        docType,
        referenceNumber: 'RACUN-2025-001',
        notes: ['Vračilo v 15 dneh.'],
      };
    case 'PURCHASE_ORDER':
      return {
        ...base,
        docType,
        notes: ['Dobava v 14 dneh.', 'Kontaktirajte skladišče pred dostavo.'],
      };
    case 'DELIVERY_NOTE':
      return {
        ...base,
        docType,
        notes: ['Preverite količine ob prevzemu.'],
      };
    case 'WORK_ORDER':
      return {
        ...base,
        docType,
        comment: 'Izvedba skladno z navodili projekta.',
        tasks: (base.items ?? []).map((item) => ({ label: item.name, status: 'in-progress' as const })),
      };
    case 'WORK_ORDER_CONFIRMATION':
      return {
        ...base,
        docType,
        tasks: (base.items ?? []).map((item) => ({ label: item.name, status: 'done' as const })),
        comment: 'Dela so bila uspešno zaključena.',
      };
    default:
      return { ...base, docType: 'OFFER' };
  }
}

async function main() {
  const outputDir = path.resolve(process.cwd(), 'tmp');
  await fs.promises.mkdir(outputDir, { recursive: true });

  for (const docType of DOC_TYPES) {
    const context = buildContextFor(docType);
    const html = renderDocumentHtml(context);
    const buffer = await renderHtmlToPdf(html);
    const fileName = `${docType.toLowerCase().replace(/_/g, '-')}.pdf`;
    const outputPath = path.join(outputDir, fileName);
    await fs.promises.writeFile(outputPath, buffer);
    console.log(`PDF smoke test generated: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error('PDF smoke test failed:', error);
  process.exit(1);
});

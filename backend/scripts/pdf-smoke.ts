import fs from 'fs';
import path from 'path';
import { renderHtmlToPdf } from '../modules/projects/services/html-pdf.service';
import { renderOfferPdf, type DocumentPreviewContext } from '../modules/projects/services/document-renderers';

async function main() {
  const context: DocumentPreviewContext = {
    docType: 'OFFER',
    documentNumber: 'PONUDBA-2025-001',
    issueDate: new Date().toLocaleDateString('sl-SI'),
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
      logoAssetId: '',
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
      { name: 'LED panel 60x60', quantity: 12, unitPrice: 85, total: 1020 },
      { name: 'Montaža in konfiguracija', quantity: 8, unitPrice: 45, total: 360 },
    ],
    totals: {
      subtotal: 1380,
      discount: 0,
      vat: 303.6,
      total: 1683.6,
    },
    notes: ['Plačilo v 15 dneh.', 'Ponudba je informativne narave.'],
    comment: 'To je predstavitveni PDF, generiran v CI.',
  };

  const html = renderOfferPdf(context);
  const buffer = await renderHtmlToPdf(html);

  const outputDir = path.resolve(process.cwd(), 'tmp');
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'demo-offer.pdf');
  await fs.promises.writeFile(outputPath, buffer);

  console.log(`PDF smoke test generated: ${outputPath}`);
}

main().catch((error) => {
  console.error('PDF smoke test failed:', error);
  process.exit(1);
});

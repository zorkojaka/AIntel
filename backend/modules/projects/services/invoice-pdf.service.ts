import PDFDocument from 'pdfkit';
import { ProjectModel } from '../schemas/project';
import type { Types } from 'mongoose';

interface InvoiceVersion {
  _id: string;
  versionNumber: number;
  status: 'draft' | 'issued';
  createdAt: string;
  issuedAt: string | null;
  items: {
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
    totalWithoutVat: number;
    totalWithVat: number;
  }[];
  summary: {
    baseWithoutVat: number;
    discountedBase: number;
    vatAmount: number;
    totalWithVat: number;
  };
  invoiceNumber?: string;
}

function buildHeader(doc: any, project: any, invoice: InvoiceVersion) {
  doc.fontSize(18).text('Račun', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Projekt: ${project.title ?? project.id}`);
  doc.text(`Stranka: ${project.customer?.name ?? ''}`);
  doc.text(`Naslov: ${project.customer?.address ?? ''}`);
  doc.text(`Izdan: ${invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString('sl-SI') : ''}`);
  doc.text(`Št. računa: ${invoice.invoiceNumber ?? `${project.id}-${invoice.versionNumber}`}`);
  doc.moveDown(1);
}

function renderTable(doc: any, items: InvoiceVersion['items']) {
  doc.fontSize(12).text('Postavke', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10);
  doc.text('Naziv', 50, doc.y, { continued: true });
  doc.text('Količina', 200, doc.y, { continued: true });
  doc.text('EM', 270, doc.y, { continued: true });
  doc.text('Cena', 320, doc.y, { continued: true });
  doc.text('DDV%', 380, doc.y, { continued: true });
  doc.text('Znesek z DDV', 440);
  doc.moveDown(0.5);
  items.forEach((item) => {
    doc.text(item.name, 50, doc.y, { continued: true });
    doc.text(item.quantity.toFixed(2), 200, doc.y, { continued: true });
    doc.text(item.unit || '', 270, doc.y, { continued: true });
    doc.text(item.unitPrice.toFixed(2), 320, doc.y, { continued: true });
    doc.text(`${item.vatPercent}%`, 380, doc.y, { continued: true });
    doc.text(item.totalWithVat.toFixed(2), 440);
  });
  doc.moveDown(1);
}

function renderSummary(doc: any, invoice: InvoiceVersion) {
  doc.fontSize(12).text('Povzetek', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10);
  doc.text(`Osnova brez DDV: ${invoice.summary.baseWithoutVat.toFixed(2)} €`);
  doc.text(`Osnova po popustu: ${invoice.summary.discountedBase.toFixed(2)} €`);
  doc.text(`Znesek DDV: ${invoice.summary.vatAmount.toFixed(2)} €`);
  doc.text(`Skupaj z DDV: ${invoice.summary.totalWithVat.toFixed(2)} €`);
  doc.moveDown(0.5);
  doc.text('Plačilni podatki:');
  doc.text('IBAN: SI56 0000 0000 0000 000');
  doc.text('Plačilni rok: 8 dni');
}

export async function generateInvoicePdf(projectId: string, invoiceVersionId: string) {
  const project = await ProjectModel.findOne({ id: projectId }).lean();
  if (!project) {
    throw new Error('Projekt ni najden.');
  }
  const invoice = (project.invoiceVersions ?? []).find((entry: InvoiceVersion) => entry._id === invoiceVersionId) as
    | InvoiceVersion
    | undefined;
  if (!invoice) {
    throw new Error('Verzija računa ni najdena.');
  }
  if (invoice.status !== 'issued') {
    throw new Error('Račun še ni izdan.');
  }

  const doc = new PDFDocument({ margin: 50 });
  const buffers: Buffer[] = [];
  doc.on('data', (chunk) => buffers.push(chunk as Buffer));

  buildHeader(doc, project, invoice);
  renderTable(doc, invoice.items ?? []);
  renderSummary(doc, invoice);
  doc.end();

  await new Promise<void>((resolve) => doc.on('end', () => resolve()));

  return Buffer.concat(buffers);
}

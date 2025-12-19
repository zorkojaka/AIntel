import QRCode from 'qrcode';
import type { Types } from 'mongoose';
import { ProjectModel, type ProjectDocument } from '../schemas/project';
import { renderHtmlToPdf } from './html-pdf.service';
import { renderDocumentHtml, type DocumentPreviewContext } from './document-renderers';
import { getCompanySettings, getPdfDocumentSettings } from './pdf-settings.service';
import { getSettings } from '../../settings/settings.service';

export interface InvoiceVersion {
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

export async function generateInvoicePdf(projectId: string, invoiceVersionId: string) {
  const project = (await ProjectModel.findOne({ id: projectId }).lean()) as ProjectDocument | null;
  if (!project) {
    throw new Error('Projekt ni najden.');
  }
  const invoice = (project.invoiceVersions ?? []).find((entry: InvoiceVersion) => entry._id === invoiceVersionId) as
    | InvoiceVersion
    | undefined;
  if (!invoice) {
    throw new Error('Verzija računa ni najdena.');
  }
  const [company, documentSettings, globalSettings] = await Promise.all([
    getCompanySettings(),
    getPdfDocumentSettings('INVOICE'),
    getSettings(),
  ]);

  const documentNumber = invoice.invoiceNumber ?? `${project.id}-${invoice.versionNumber}`;
  const issueDate = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date(invoice.createdAt ?? Date.now());
  const dueDays = extractDueDays(project.customer?.paymentTerms) ?? 8;
  const dueDate = dueDays > 0 ? formatDate(addDays(issueDate, dueDays)) : null;

  const items = (invoice.items ?? []).map((item) => ({
    name: item.name,
    quantity: Number(item.quantity ?? 0),
    unit: item.unit ?? '',
    unitPrice: item.unitPrice ?? 0,
    vatPercent: item.vatPercent ?? 22,
    total: item.totalWithVat ?? 0,
  }));

  const summary = invoice.summary ?? { baseWithoutVat: 0, discountedBase: 0, vatAmount: 0, totalWithVat: 0 };
  const discountValue = Math.max(0, (summary.baseWithoutVat ?? 0) - (summary.discountedBase ?? summary.baseWithoutVat ?? 0));

  const totals = {
    subtotal: summary.baseWithoutVat ?? 0,
    discount: discountValue,
    vat: summary.vatAmount ?? 0,
    total: summary.totalWithVat ?? 0,
    dueDays,
  };

  const notes = buildInvoiceNotes(documentSettings.defaultTexts, project.customer?.paymentTerms);
  const paymentInfo = await buildPaymentInfo({
    recipient: company.companyName ?? 'Podjetje',
    iban: company.iban ?? '',
    amount: totals.total ?? 0,
    reference: documentNumber,
    purpose: `Plačilo računa ${documentNumber}`,
  });

  const customer = project.customer
    ? {
        name: project.customer.name ?? '',
        address: formatCustomerAddress(project.customer.address),
        taxId: project.customer.taxId ?? '',
      }
    : undefined;

  const companyProfile = buildCompanyProfile(company, globalSettings);

  const context = {
    docType: 'INVOICE',
    documentNumber,
    issueDate: formatDate(issueDate),
    dueDate,
    company: companyProfile,
    customer,
    projectTitle: project.title ?? project.id,
    items,
    totals,
    notes,
    paymentTerms: project.customer?.paymentTerms ?? documentSettings.defaultTexts.paymentTerms ?? null,
    paymentInfo,
  } as DocumentPreviewContext;

  console.log('INVOICE EXPORT renderer', {
    projectId,
    invoiceVersionId,
    hasLogo: !!companyProfile.logoUrl,
    companyName: companyProfile.companyName,
  });

  const html = renderDocumentHtml(context);
  return renderHtmlToPdf(html);
}

function formatDate(value: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }
  return date.toLocaleDateString('sl-SI');
}

function addDays(base: Date, days: number) {
  const clone = new Date(base);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function extractDueDays(terms?: string | null) {
  if (!terms) return null;
  const match = terms.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function formatCustomerAddress(address?: string | null) {
  if (!address) return '';
  return address
    .split(/\n|,\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function buildInvoiceNotes(
  defaults: { paymentTerms?: string; disclaimer?: string },
  customerTerms?: string | null,
) {
  return [customerTerms, defaults.paymentTerms, defaults.disclaimer]
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .map((text) => text.trim());
}

interface PaymentSeed {
  recipient: string;
  iban: string;
  amount: number;
  reference: string;
  purpose: string;
}

async function buildPaymentInfo(seed: PaymentSeed) {
  const info = {
    recipient: seed.recipient,
    iban: seed.iban,
    amount: seed.amount,
    reference: seed.reference,
    purpose: seed.purpose,
    qrCodeDataUri: null as string | null,
    notice: null as string | null,
  };

  const hasData = seed.recipient && seed.iban && seed.amount > 0 && seed.reference;
  if (!hasData) {
    info.notice = 'QR ni na voljo (manjkajo podatki).';
    return info;
  }

  const payload = buildUpnQrPayload(seed);
  try {
    info.qrCodeDataUri = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 0 });
  } catch (error) {
    info.qrCodeDataUri = null;
    info.notice = 'QR ni na voljo (napaka pri generiranju).';
    console.error('Failed to generate QR code', error);
  }
  return info;
}

function buildUpnQrPayload(seed: PaymentSeed) {
  const amount = (seed.amount ?? 0).toFixed(2);
  const lines = [
    'UPNQR',
    seed.recipient ?? '',
    seed.iban ?? '',
    amount,
    seed.reference ?? '',
    seed.purpose ?? '',
  ];
  return lines.join('\n');
}

function buildCompanyProfile(
  company: Awaited<ReturnType<typeof getCompanySettings>>,
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  const addressParts = [
    settings.address,
    [settings.postalCode, settings.city].filter(Boolean).join(' ').trim(),
    settings.country,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => !!value);

  return {
    ...company,
    companyName: settings.companyName || company.companyName,
    address: addressParts.length ? addressParts.join('\n') : company.address,
    email: settings.email || company.email,
    phone: settings.phone || company.phone,
    vatId: settings.vatId || company.vatId,
    iban: settings.iban || company.iban,
    directorName: settings.directorName || company.directorName,
    logoUrl: settings.logoUrl || company.logoUrl,
    primaryColor: settings.primaryColor || company.primaryColor || '#0f62fe',
    website: settings.website || company.website,
  };
}

import type { OfferLineItem } from '../../../../shared/types/offers';
import type { ProjectDocument } from '../schemas/project';

type TemplateCategory = 'offer' | 'invoice';

interface TemplateLike {
  id: string;
  category: TemplateCategory | string;
  content: string;
  isDefault?: boolean;
  name?: string;
}

export function getDefaultTemplate(project: ProjectDocument, category: TemplateCategory) {
  const templates = Array.isArray(project.templates) ? project.templates : [];
  return (
    templates.find(
      (template: TemplateLike) => template.category === category && Boolean(template.isDefault)
    ) ?? null
  );
}

const numberFormatter = new Intl.NumberFormat('sl-SI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const tokenRegex = /{{\s*([\w.]+)\s*}}/g;

export function renderTemplateContent(content: string, tokens: Record<string, string>) {
  if (!content) return '';
  return content.replace(tokenRegex, (match, key) => {
    const normalized = key?.trim();
    if (!normalized || !(normalized in tokens)) {
      return match;
    }
    return tokens[normalized] ?? '';
  });
}

export function buildItemsHtml(items: TemplateItem[]): string {
  if (!items.length) {
    return '<div class="items-empty">Ni postavk.</div>';
  }

  const rows = items
    .map((item) => {
      const safeName = escapeHtml(item.name ?? '');
      const safeUnit = escapeHtml(item.unit ?? '');
      const safeDescription = item.description ? `<div class="item-description">${escapeHtml(item.description)}</div>` : '';
      return `<tr>
  <td>
    <div class="item-name">${safeName}</div>
    ${safeDescription}
  </td>
  <td>${item.quantity ?? ''}</td>
  <td>${safeUnit}</td>
  <td>${item.unitPrice ?? ''}</td>
  <td>${item.vatRate ?? ''}</td>
  <td>${item.total ?? ''}</td>
</tr>`;
    })
    .join('\n');

  return `<table class="items-table">
  <thead>
    <tr>
      <th>Postavka</th>
      <th>Količina</th>
      <th>Enota</th>
      <th>Cena</th>
      <th>DDV%</th>
      <th>Skupaj</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

type TemplateItem = {
  name: string;
  description?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  vatRate?: string;
  total?: string;
};

const formatCurrency = (value?: number | null) => numberFormatter.format(value ?? 0);

const formatQuantity = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? numberFormatter.format(value) : '';

const formatPercent = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '';

const formatDate = (value?: string | Date | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return date.toLocaleDateString('sl-SI');
};

const buildBaseProjectTokens = (project: ProjectDocument) => ({
  customerName: project.customer?.name ?? '',
  customerAddress: project.customer?.address ?? '',
  customerTaxId: project.customer?.taxId ?? '',
  projectTitle: project.title ?? project.id,
  projectId: project.id ?? project.code ?? '',
  projectDescription: '',
  paymentTerms: project.customer?.paymentTerms ?? '',
});

export function buildOfferTemplateTokens(project: ProjectDocument, offer: OfferVersionForTemplate) {
  const base = buildBaseProjectTokens(project);
  const items = (offer.items ?? []).map<TemplateItem>((item) => ({
    name: item.name,
    description: '',
    quantity: formatQuantity(item.quantity),
    unit: item.unit,
    unitPrice: formatCurrency(item.unitPrice),
    vatRate: formatPercent(item.vatRate),
    total: formatCurrency(item.totalGross),
  }));

  return {
    ...base,
    offerVersion: offer.versionNumber != null ? `${offer.versionNumber}` : '',
    offerDate: formatDate(offer.createdAt ?? offer.updatedAt),
    totalNet: formatCurrency(offer.totalNetAfterDiscount ?? offer.totalNet ?? 0),
    totalVat: formatCurrency(offer.totalVat ?? 0),
    totalGross: formatCurrency(
      offer.totalGrossAfterDiscount ?? offer.totalWithVat ?? offer.totalGross ?? 0
    ),
    paymentTerms: offer.paymentTerms ?? base.paymentTerms,
    itemsHtml: buildItemsHtml(items),
    items: buildItemsHtml(items),
  };
}

export function buildInvoiceTemplateTokens(project: ProjectDocument, invoice: InvoiceVersionForTemplate) {
  const base = buildBaseProjectTokens(project);
  const items = (invoice.items ?? []).map<TemplateItem>((item) => ({
    name: item.name,
    description: '',
    quantity: formatQuantity(item.quantity),
    unit: item.unit,
    unitPrice: formatCurrency(item.unitPrice),
    vatRate: formatPercent(item.vatPercent),
    total: formatCurrency(item.totalWithVat),
  }));

  return {
    ...base,
    offerVersion: invoice.invoiceNumber ?? `${project.id}-${invoice.versionNumber}`,
    offerDate: formatDate(invoice.issuedAt ?? invoice.createdAt),
    totalNet: formatCurrency(invoice.summary?.baseWithoutVat ?? 0),
    totalVat: formatCurrency(invoice.summary?.vatAmount ?? 0),
    totalGross: formatCurrency(invoice.summary?.totalWithVat ?? 0),
    paymentTerms: base.paymentTerms,
    itemsHtml: buildItemsHtml(items),
    items: buildItemsHtml(items),
  };
}

export type OfferVersionForTemplate = {
  versionNumber?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  totalNet?: number;
  totalNetAfterDiscount?: number;
  totalVat?: number;
  totalGross?: number;
  totalGrossAfterDiscount?: number;
  totalWithVat?: number;
  paymentTerms?: string | null;
  items?: OfferLineItem[];
};

export type InvoiceVersionForTemplate = {
  versionNumber: number;
  createdAt: string;
  issuedAt: string | null;
  invoiceNumber?: string;
  items: {
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
    totalWithVat: number;
  }[];
  summary: {
    baseWithoutVat: number;
    vatAmount: number;
    totalWithVat: number;
  };
};

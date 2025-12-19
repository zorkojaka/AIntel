import type { PdfCompanySettings } from '../schemas/pdf-settings';
import type { DocumentNumberingKind } from './document-numbering.service';

export interface PreviewCustomerInfo {
  name?: string;
  address?: string;
  taxId?: string;
}

export interface PreviewItem {
  code?: string | null;
  description?: string | null;
  name: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  total?: number;
  vatPercent?: number;
}

export interface PreviewTotals {
  subtotal?: number;
  discount?: number;
  vat?: number;
  total?: number;
  dueDays?: number;
}

export interface PreviewTask {
  label: string;
  status?: 'todo' | 'done' | 'in-progress';
}

export interface DocumentPreviewContext {
  docType: DocumentNumberingKind;
  documentNumber: string;
  issueDate: string;
  company: PdfCompanySettings;
  companyWebsite?: string;
  companyPrimaryColor?: string;
  customer?: PreviewCustomerInfo | null;
  projectTitle?: string;
  items?: PreviewItem[];
  totals?: PreviewTotals;
  notes?: string[];
  comment?: string | null;
  referenceNumber?: string | null;
  tasks?: PreviewTask[];
}

const currencyFormatter = new Intl.NumberFormat('sl-SI', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const baseStyles = `
  * { box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 0; }
  .page { width: 794px; margin: 24px auto; background: #fff; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-radius: 12px; }
  h1, h2, h3, h4 { margin: 0; }
  p { margin: 0; }
  .muted { color: #6b7280; }
  .brand-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
  .logo-box { width: 140px; height: 80px; border: 1px solid #e5e7eb; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #f9fafb; overflow: hidden; }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .logo-placeholder { font-weight: 600; color: #475569; font-size: 20px; }
  .company-block h2 { font-size: 20px; margin-bottom: 4px; }
  .company-block p { font-size: 13px; margin: 2px 0; }
  .party-cards { margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .party-card { padding: 14px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb; }
  .party-card__label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #6366f1; margin-bottom: 6px; display: block; }
  .party-card p { font-size: 13px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { padding: 10px 12px; text-align: left; border: 1px solid #e5e7eb; font-size: 13px; }
  th { background: #f3f4f6; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
  .section { margin-top: 24px; }
  .section h3 { font-size: 16px; margin-bottom: 8px; }
  .totals { width: 320px; margin-left: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-top: 16px; }
  .totals-row { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  .totals-row:last-child { border-bottom: none; background: #f9fafb; font-weight: 600; }
  .notes { margin-top: 16px; padding: 16px; background: #f9fafb; border: 1px dashed #94a3b8; border-radius: 12px; }
  .notes strong { text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; color: #334155; }
  .notes ul { padding-left: 18px; margin: 8px 0 0 0; color: #475569; font-size: 13px; }
  .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 32px; }
  .signature { padding: 12px; border: 1px dashed #cbd5e1; border-radius: 12px; text-align: center; }
  .signature-label { font-size: 12px; color: #475569; }
  .signature-line { height: 40px; border-bottom: 1px solid #cbd5e1; margin-top: 20px; }
  .tasks { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
  .task { padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; display: flex; align-items: center; gap: 12px; background: #fff; }
  .task-status { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; }
  .task-checkbox { width: 16px; height: 16px; border: 2px solid #cbd5e1; border-radius: 4px; display: inline-block; }
  .task-checkbox.checked { background: #22c55e; border-color: #16a34a; }
  .comment-block { margin-top: 16px; padding: 16px; border-radius: 12px; background: #fff7ed; border: 1px dashed #fdba74; }
  .comment-block strong { display: block; margin-bottom: 6px; }
  .reference-card { margin-top: 16px; padding: 14px; border: 1px solid #fecaca; background: #fef2f2; border-radius: 12px; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #475569; display: flex; flex-wrap: wrap; gap: 12px; }
`;

function wrapDocument(title: string, body: string) {
  return `<!doctype html>
  <html lang="sl">
    <head>
      <meta charset="UTF-8" />
      <style>${baseStyles}</style>
      <title>${title}</title>
    </head>
    <body>
      <div class="page">
        ${body}
      </div>
    </body>
  </html>`;
}

function formatCurrency(value: number | undefined | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(value);
}

function getCompanyInitials(name?: string) {
  if (!name) return 'LOGO';
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  return parts.join('') || 'LOGO';
}

interface DocumentMetaDetails {
  documentNumber: string;
  issueDate: string;
  projectTitle?: string;
  extraFields?: Array<{ label: string; value: string }>;
}

export function renderHeader(
  company: PdfCompanySettings,
  meta: { title: string; documentNumber: string; issueDate: string; projectTitle?: string },
  options?: { website?: string; primaryColor?: string; hideDocumentMeta?: boolean },
) {
  const accent = options?.primaryColor || '#4f46e5';
  const logo = company.logoUrl
    ? `<img src="${company.logoUrl}" alt="${company.companyName ?? 'Podjetje'}" />`
    : `<span class="logo-placeholder">${getCompanyInitials(company.companyName)}</span>`;
  const addressLine = company.address ? `<p>${company.address}</p>` : '';
  const contactLines = [company.email, company.phone, company.vatId ? `DDV: ${company.vatId}` : '', company.iban ? `IBAN: ${company.iban}` : '']
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('');

  return `<div class="brand-header" style="border-bottom-color:${accent};">
      <div class="logo-box">${logo}</div>
      <div class="company-block" style="flex:1;">
        <h2>${company.companyName ?? 'Podjetje'}</h2>
        ${addressLine}
        ${contactLines}
        ${options?.website ? `<p>${options.website}</p>` : ''}
      </div>
      ${
        options?.hideDocumentMeta
          ? ''
          : `<div style="text-align:right;">
              <p class="muted">Stevilka dokumenta</p>
              <h3 style="margin:0;">${meta.documentNumber}</h3>
              <p class="muted" style="margin-top:8px;">Datum izdaje: ${meta.issueDate}</p>
              ${meta.projectTitle ? `<p class="muted">Projekt: ${meta.projectTitle}</p>` : ''}
            </div>`
      }
    </div>`;
}

export function renderPartyCards(
  meta: DocumentMetaDetails,
  customer?: PreviewCustomerInfo | null,
) {
  const documentCard = `<div class="party-card">
      <span class="party-card__label">Dokument</span>
      <p><strong>Stevilka:</strong> ${meta.documentNumber}</p>
      <p><strong>Datum:</strong> ${meta.issueDate}</p>
      ${meta.projectTitle ? `<p><strong>Projekt:</strong> ${meta.projectTitle}</p>` : ''}
      ${
        meta.extraFields
          ? meta.extraFields
              .filter((field) => field.value)
              .map((field) => `<p><strong>${field.label}:</strong> ${field.value}</p>`)
              .join('')
          : ''
      }
    </div>`;

  const customerCard = customer
    ? `<div class="party-card">
        <span class="party-card__label">Stranka</span>
        ${customer.name ? `<p><strong>${customer.name}</strong></p>` : ''}
        ${customer.address ? `<p>${customer.address}</p>` : ''}
        ${customer.taxId ? `<p>Davcna: ${customer.taxId}</p>` : ''}
      </div>`
    : '';

  if (!customerCard) {
    return `<div class="party-cards">${documentCard}</div>`;
  }

  return `<div class="party-cards">${documentCard}${customerCard}</div>`;
}

export function renderFooter(company: PdfCompanySettings, options?: { website?: string }) {
  const parts = [
    company.email,
    company.phone,
    options?.website,
    company.vatId ? `DDV: ${company.vatId}` : '',
    company.iban ? `IBAN: ${company.iban}` : '',
    company.directorName ? `Direktor: ${company.directorName}` : '',
  ]
    .filter(Boolean)
    .map((part) => `<span>${part}</span>`)
    .join('');
  return `<footer>${parts}</footer>`;
}

export function renderNotesBlock(notes?: string[]) {
  if (!notes || notes.length === 0) return '';
  return `<div class="notes">
      <strong>Opombe</strong>
      <ul>
        ${notes.map((note) => `<li>${note}</li>`).join('')}
      </ul>
    </div>`;
}

const SIGNATURE_LABELS: Record<DocumentNumberingKind, { left: string; right: string }> = {
  OFFER: { left: 'Ponudnik', right: 'Narocnik' },
  INVOICE: { left: 'Izdal', right: 'Placnik' },
  PURCHASE_ORDER: { left: 'Narocil', right: 'Dobavitelj' },
  DELIVERY_NOTE: { left: 'Oddal', right: 'Prevzel' },
  WORK_ORDER: { left: 'Tehnik', right: 'Stranka' },
  WORK_ORDER_CONFIRMATION: { left: 'Izvajalec', right: 'Narocnik' },
  CREDIT_NOTE: { left: 'Izdal', right: 'Prejel' },
};

export function renderSignatureBlock(docType: DocumentNumberingKind, overrides?: { leftLabel?: string; rightLabel?: string }) {
  const defaults = SIGNATURE_LABELS[docType] ?? { left: 'Podpis', right: 'Stranka' };
  const left = overrides?.leftLabel ?? defaults.left;
  const right = overrides?.rightLabel ?? defaults.right;
  return `<div class="signatures">
      <div class="signature">
        <p class="signature-label">${left}</p>
        <div class="signature-line"></div>
      </div>
      <div class="signature">
        <p class="signature-label">${right}</p>
        <div class="signature-line"></div>
      </div>
    </div>`;
}

function renderTotalsBox(entries: Array<{ label: string; value: string }>) {
  if (!entries.length) return '';
  return `<div class="totals">
      ${entries
        .map(
          (entry, index) =>
            `<div class="totals-row" style="${index === entries.length - 1 ? 'font-weight:600;' : ''}">
              <span>${entry.label}</span>
              <span>${entry.value}</span>
            </div>`,
        )
        .join('')}
    </div>`;
}

interface OfferBaseOptions {
  title?: string;
  docType?: DocumentNumberingKind;
  showPrices?: boolean;
  showTotals?: boolean;
  signatureDocType?: DocumentNumberingKind;
  signatureLabels?: { leftLabel?: string; rightLabel?: string };
}

export function renderOfferBaseHtml(context: DocumentPreviewContext, options?: OfferBaseOptions) {
  const displayTitle = options?.title ?? 'Ponudba';
  const docType = options?.docType ?? context.docType ?? 'OFFER';
  const showPrices = options?.showPrices ?? true;
  const showTotals = options?.showTotals ?? true;
  const signatureDocType = options?.signatureDocType ?? docType;

  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[document-renderers]', { docType, baseTemplateUsed: 'OFFER_BASE' });
  }

  const header = renderHeader(
    context.company,
    {
      title: displayTitle,
      documentNumber: context.documentNumber,
      issueDate: context.issueDate,
      projectTitle: context.projectTitle,
    },
    { website: context.companyWebsite, primaryColor: context.companyPrimaryColor },
  );

  const partyCards = renderPartyCards(
    { documentNumber: context.documentNumber, issueDate: context.issueDate, projectTitle: context.projectTitle },
    context.customer,
  );

  const tableHeaders = showPrices
    ? [
        { label: 'Postavka', align: 'left' as const },
        { label: 'Kolicina', align: 'right' as const },
        { label: 'Cena', align: 'right' as const },
        { label: 'Znesek', align: 'right' as const },
      ]
    : [
        { label: 'Postavka', align: 'left' as const },
        { label: 'Kolicina', align: 'right' as const },
        { label: 'Enota', align: 'left' as const },
      ];

  const rows = (context.items ?? []).map((item) => {
    const unitPrice = item.unitPrice ?? 0;
    const total = item.total ?? unitPrice * item.quantity;
    const cells = showPrices
      ? [
          `<td>${item.name}</td>`,
          `<td style="text-align:right;">${item.quantity}</td>`,
          `<td style="text-align:right;">${formatCurrency(unitPrice)}</td>`,
          `<td style="text-align:right;">${formatCurrency(total)}</td>`,
        ]
      : [
          `<td>${item.name}</td>`,
          `<td style="text-align:right;">${item.quantity}</td>`,
          `<td>${item.unit ?? ''}</td>`,
        ];
    return `<tr>${cells.join('')}</tr>`;
  });

  const totalsEntries =
    showTotals && context.totals
      ? [
          { label: 'Skupaj brez DDV', value: formatCurrency(context.totals.subtotal) },
          { label: 'Popust', value: formatCurrency(context.totals.discount) },
          { label: 'DDV', value: formatCurrency(context.totals.vat) },
          { label: 'Skupaj z DDV', value: formatCurrency(context.totals.total) },
        ]
      : [];

  const commentBlock = context.comment
    ? `<div class="comment-block">
        <strong>Komentar</strong>
        <p class="muted">${context.comment}</p>
      </div>`
    : '';

  const body = `${header}
    ${partyCards}
    <div class="section">
      <h3>Predmet</h3>
      <p class="muted">${context.projectTitle ?? 'Predmet ponudbe'}</p>
      <table>
        <thead>
          <tr>${tableHeaders
            .map(
              (column) =>
                `<th${column.align === 'right' ? ' style="text-align:right;"' : ''}>${column.label}</th>`,
            )
            .join('')}</tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      ${showTotals ? renderTotalsBox(totalsEntries) : ''}
    </div>
    ${commentBlock}
    ${renderNotesBlock(context.notes)}
    ${renderSignatureBlock(signatureDocType, options?.signatureLabels)}
    ${renderFooter(context.company, { website: context.companyWebsite })}`;

  return wrapDocument(displayTitle, body);
}

export function renderOfferPdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, { title: 'Ponudba', docType: 'OFFER', signatureDocType: 'OFFER' });
}

export function renderInvoicePdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, { title: 'Racun', docType: 'INVOICE', signatureDocType: 'INVOICE' });
}

export function renderPurchaseOrderPdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, {
    title: 'Narocilnica',
    docType: 'PURCHASE_ORDER',
    signatureDocType: 'PURCHASE_ORDER',
    showPrices: false,
    showTotals: false,
  });
}

export function renderDeliveryNotePdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, {
    title: 'Dobavnica',
    docType: 'DELIVERY_NOTE',
    signatureDocType: 'DELIVERY_NOTE',
    showPrices: false,
    showTotals: false,
    signatureLabels: { leftLabel: 'Prevzel', rightLabel: 'Izrocil' },
  });
}


function renderTaskList(tasks: PreviewTask[], mode: 'work' | 'confirmation') {
  return `<div class="tasks">
      ${tasks
        .map((task) => {
          const status = task.status ?? 'todo';
          const isDone = status === 'done';
          const checkboxClass = `task-checkbox${isDone ? ' checked' : ''}`;
          const badgeColor =
            mode === 'confirmation'
              ? 'background:#dcfce7;color:#15803d;'
              : status === 'in-progress'
              ? 'background:#fef9c3;color:#a16207;'
              : isDone
              ? 'background:#dcfce7;color:#15803d;'
              : 'background:#e0e7ff;color:#3730a3;';
          return `<div class="task">
              <span class="${checkboxClass}"></span>
              <span>${task.label}</span>
              <span class="task-status" style="${badgeColor}">${status}</span>
            </div>`;
        })
        .join('')}
    </div>`;
}

export function renderWorkOrderPdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, { title: 'Delovni nalog', docType: 'WORK_ORDER', signatureDocType: 'WORK_ORDER' });
}

export function renderWorkOrderConfirmationPdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, {
    title: 'Potrdilo o izvedbi del',
    docType: 'WORK_ORDER_CONFIRMATION',
    signatureDocType: 'WORK_ORDER_CONFIRMATION',
  });
}

export function renderCreditNotePdf(context: DocumentPreviewContext) {
  return renderOfferBaseHtml(context, { title: 'Dobropis', docType: 'CREDIT_NOTE', signatureDocType: 'CREDIT_NOTE' });
}

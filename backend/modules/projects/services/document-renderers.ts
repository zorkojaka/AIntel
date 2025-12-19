import type { PdfCompanySettings } from '../schemas/pdf-settings';
import type { DocumentNumberingKind } from './document-numbering.service';

export interface PreviewCustomerInfo {
  name?: string;
  address?: string;
  taxId?: string;
}

export interface PreviewItem {
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

export interface PaymentInfoContext {
  recipient?: string;
  iban?: string;
  amount?: number;
  reference?: string;
  purpose?: string;
  qrCodeDataUri?: string | null;
  notice?: string | null;
}

export interface DocumentPreviewContext {
  docType: DocumentNumberingKind;
  documentNumber: string;
  issueDate: string;
  validUntil?: string | null;
  dueDate?: string | null;
  paymentTerms?: string | null;
  company: PdfCompanySettings & { primaryColor?: string; website?: string };
  customer?: PreviewCustomerInfo | null;
  projectTitle?: string;
  items?: PreviewItem[];
  totals?: PreviewTotals;
  notes?: string[];
  comment?: string | null;
  referenceNumber?: string | null;
  tasks?: PreviewTask[];
  paymentInfo?: PaymentInfoContext | null;
}

const baseStyles = `
  * { box-sizing: border-box; }
  html, body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111827; background: #fff; margin: 0; padding: 0; }
  @page { margin: 24px; background: #fff; }
  .page { width: 794px; min-height: 1122px; margin: 0 auto; background: #fff; padding: 48px; display:flex; flex-direction:column; }
  h1, h2, h3, h4 { margin: 0; }
  .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; page-break-inside:auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { padding: 8px 10px; text-align: left; border: 1px solid #e5e7eb; font-size: 13px; }
  th { background: #f3f4f6; font-weight: 600; }
  .totals { width: 320px; margin-left: auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  .totals-row:last-child { border-bottom: none; background: #f9fafb; font-weight: 700; }
  .notes { margin-top: 16px; padding: 12px; background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 10px; }
  .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
  .signature { padding: 12px; border: 1px dashed #cbd5e1; border-radius: 10px; text-align: center; }
  .tasks { margin-top: 12px; }
  .task { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
  .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; }
  .offer-preview { display:flex; flex-direction:column; gap:24px; flex:1; min-height:100%; }
  .offer-header { display:flex; justify-content:space-between; align-items:flex-start; gap:32px; break-inside:avoid; padding:12px 0 20px; }
  .offer-logo { width:180px; height:80px; display:flex; align-items:center; justify-content:flex-start; overflow:hidden; border:none; background:none; padding:12px 0; }
  .offer-logo img { max-width:100%; max-height:100%; object-fit:contain; }
  .offer-company { text-align:right; font-size:13px; color:#475569; line-height:1.35; }
  .offer-company p { margin:2px 0; }
  .offer-company-name { font-size:22px; font-weight:600; margin-bottom:4px; }
  .offer-meta-grid { display:grid; gap:24px; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); break-inside:avoid; }
  .offer-card { border:1px solid #e2e8f0; border-radius:14px; padding:16px; background:#fff; break-inside:avoid; }
  .offer-card h4 { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#475569; margin-bottom:8px; }
  .offer-card p { margin:4px 0; font-size:13px; }
  .offer-content { display:flex; flex-direction:column; flex:1; min-height:100%; padding-bottom:32px; }
  .offer-table { width:100%; border-collapse:collapse; font-size:13px; margin-top:12px; break-inside:auto; }
  .offer-table th { background:#f1f5f9; text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color:#475569; }
  .offer-table th, .offer-table td { border:1px solid #e2e8f0; padding:10px 12px; }
  .offer-table td { color:#0f172a; }
  .offer-project-title { margin-top:28px; }
  .offer-comment { margin-top:16px; border-radius:12px; border:1px solid rgba(148,163,184,0.5); padding:14px 18px; background:#f8fafc; break-inside:avoid; }
  .offer-comment h4 { font-size:14px; font-weight:600; margin-bottom:6px; color:#0f172a; }
  .offer-comment p { margin:0; color:#475569; }
  .offer-notes { margin-top:16px; break-inside:avoid; }
  .offer-notes ul { margin:8px 0 0; padding-left:20px; }
  .offer-notes li { font-size:12px; color:#475569; margin-bottom:4px; }
  .offer-bottom { margin-top:auto; display:flex; flex-direction:column; gap:20px; }
  .offer-footer { border-top:1px solid #e2e8f0; margin-top:0; padding-top:16px; display:flex; flex-direction:column; gap:4px; break-inside:avoid; }
  .offer-contact-line { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; font-size:12px; color:#475569; }
  .offer-dot { color:#cbd5e1; margin:0 4px; }
`;

const currencyFormatter = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' });

function formatCurrency(value?: number) {
  return currencyFormatter.format(Number(value ?? 0));
}

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

export function buildHeaderHtml(
  company: PdfCompanySettings,
  meta: { title: string; documentNumber: string; issueDate: string; customer?: PreviewCustomerInfo | null; projectTitle?: string }
) {
  const customer = meta.customer;
  const customerBlock = customer
    ? `<div>
        <h4>Stranka</h4>
        <p class="muted">${customer.name ?? ''}</p>
        ${customer.address ? `<p class="muted">${customer.address}</p>` : ''}
        ${customer.taxId ? `<p class="muted">Davcna: ${customer.taxId}</p>` : ''}
      </div>`
    : '';

  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #e5e7eb;padding-bottom:16px;">
      <div>
        <h1 style="font-size:24px; margin-bottom:4px;">${meta.title}</h1>
        <p class="muted">Stevilka: <strong>${meta.documentNumber}</strong></p>
        <p class="muted">Datum: ${meta.issueDate}</p>
        ${meta.projectTitle ? `<p class="muted">Projekt: ${meta.projectTitle}</p>` : ''}
      </div>
      <div style="text-align:right;">
        <h3 style="margin:0;">${company.companyName}</h3>
        <p class="muted">${company.address}</p>
        ${company.email ? `<p class="muted">${company.email}</p>` : ''}
        ${company.phone ? `<p class="muted">${company.phone}</p>` : ''}
        ${company.vatId ? `<p class="muted">DDV: ${company.vatId}</p>` : ''}
      </div>
    </div>
    ${customerBlock}`;
}

export function buildFooterHtml(company: PdfCompanySettings) {
  const parts = [company.email, company.phone, company.iban ? `IBAN: ${company.iban}` : '', company.directorName ? `Direktor: ${company.directorName}` : '']
    .filter(Boolean)
    .map((part) => `<span style="margin-right:10px;">${part}</span>`)
    .join('');
  return `<footer style="margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:12px;" class="muted">${parts}</footer>`;
}

export function buildNotesBlockHtml(notes?: string[]) {
  if (!notes || notes.length === 0) return '';
  return `<div class="notes">
      <strong>Opombe</strong>
      <ul style="padding-left:18px; margin-top:8px;">
        ${notes.map((note) => `<li class="muted">${note}</li>`).join('')}
      </ul>
    </div>`;
}

export function buildSignatureBlock(options?: { leftLabel?: string; rightLabel?: string }) {
  return `<div class="signatures">
      <div class="signature">
        <p class="muted">${options?.leftLabel ?? 'Podpis odgovorne osebe'}</p>
        <div style="height:40px;border-bottom:1px solid #e5e7eb;margin-top:18px;"></div>
      </div>
      <div class="signature">
        <p class="muted">${options?.rightLabel ?? 'Podpis stranke'}</p>
        <div style="height:40px;border-bottom:1px solid #e5e7eb;margin-top:18px;"></div>
      </div>
    </div>`;
}

function buildCustomerLines(context: DocumentPreviewContext, emptyText: string) {
  if (!context.customer) {
    return `<p class="muted">${emptyText}</p>`;
  }

  const parts = [
    context.customer.taxId ? `<p>Davčna: ${context.customer.taxId}</p>` : '',
    context.customer.name ? `<p>${context.customer.name}</p>` : '',
    context.customer.address
      ? context.customer.address
          .split(/\n|,\s*/)
          .map((line) => `<p>${line.trim()}</p>`)
          .join('')
      : '',
  ];
  return parts.join('');
}

function buildNotesList(notes?: string[]) {
  if (!notes || notes.length === 0) return '';
  return `<div class="offer-notes">
      <p style="font-weight:600;">Opombe</p>
      <ul>${notes.map((note) => `<li>${note}</li>`).join('')}</ul>
    </div>`;
}

interface DocumentShellOptions {
  docLabel: string;
  pageTitle: string;
  customerEmptyText: string;
  projectTitleFallback: string;
  metaExtras?: string[];
  tableHeadRows: string;
  tableBodyRows: string;
  tableFooterRows?: string;
  commentBlock?: string;
  notesBlock?: string;
  extraSections?: string;
}

function buildStandardDocument(context: DocumentPreviewContext, options: DocumentShellOptions) {
  const brandColor = context.company.primaryColor || '#0f62fe';
  const logoBlock = context.company.logoUrl
    ? `<img src="${context.company.logoUrl}" alt="Logotip podjetja" />`
    : `<span class="muted">Logo</span>`;

  const addressLines = (context.company.address ?? '')
    .split(/\n|,\s*/)
    .map((line) => line.trim())
    .filter((line) => !!line);
  const addressHtml = addressLines.length
    ? addressLines.map((line) => `<p>${line}</p>`).join('')
    : `<p>${context.company.address ?? ''}</p>`;

  const contactItems = [
    context.company.email ? `<span>${context.company.email}</span>` : null,
    context.company.phone ? `<span>${context.company.phone}</span>` : null,
    context.company.website ? `<span>${context.company.website}</span>` : null,
  ].filter(Boolean) as string[];
  const financeItems = [
    context.company.vatId ? `<span>DDV: ${context.company.vatId}</span>` : null,
    context.company.iban ? `<span>IBAN: ${context.company.iban}</span>` : null,
  ].filter(Boolean) as string[];
  const dotSeparator = '<span class="offer-dot">&bull;</span>';
  const contactLine = contactItems.length ? `<div class="offer-contact-line">${contactItems.join(dotSeparator)}</div>` : '';
  const financeLine = financeItems.length ? `<div class="offer-contact-line">${financeItems.join(dotSeparator)}</div>` : '';

  const customerLines = buildCustomerLines(context, options.customerEmptyText);
  const metaRows = [
    `<p><span class="muted">Dokument:</span> ${options.docLabel}</p>`,
    `<p><span class="muted">Št.:</span> ${context.documentNumber}</p>`,
    `<p><span class="muted">Datum:</span> ${context.issueDate}</p>`,
    ...(options.metaExtras ?? []),
  ].join('');

  const tableFooter = options.tableFooterRows ? `<tfoot>${options.tableFooterRows}</tfoot>` : '';
  const commentBlock = options.commentBlock ?? '';
  const notesBlock = options.notesBlock ?? '';
  const extraSections = options.extraSections ?? '';

  const body = `<div class="offer-preview">
      <div class="offer-content">
        <div class="offer-header">
          <div class="offer-logo">${logoBlock}</div>
          <div class="offer-company">
            <p class="offer-company-name" style="color:${brandColor};">${context.company.companyName}</p>
            ${addressHtml}
          </div>
        </div>

        <div class="offer-meta-grid">
          <div class="offer-card">
            <h4>Stranka</h4>
            ${customerLines}
          </div>
          <div class="offer-card">
            <h4>Dokument</h4>
            ${metaRows}
          </div>
        </div>

        <div class="offer-project-title">
          <h3 style="font-size:18px; font-weight:600; margin-bottom:4px;">${context.projectTitle ?? options.projectTitleFallback}</h3>
        </div>

        <table class="offer-table">
          <thead>${options.tableHeadRows}</thead>
          <tbody>${options.tableBodyRows}</tbody>
          ${tableFooter}
        </table>

        ${commentBlock}
        ${notesBlock}
        ${extraSections}

        <div class="offer-bottom">
          <div class="offer-footer">
            ${contactLine}
            ${financeLine}
          </div>
        </div>
      </div>
    </div>`;

  return wrapDocument(options.pageTitle, body);
}

export function renderOfferPdf(context: DocumentPreviewContext) {
  const rows = (context.items ?? []).map((item) => {
    const unitPrice = item.unitPrice ?? 0;
    const total = item.total ?? unitPrice * item.quantity;
    return `<tr>
      <td>${item.name}</td>
      <td style="text-align:right;">${item.quantity}</td>
      <td style="text-align:right;">${formatCurrency(unitPrice)}</td>
      <td style="text-align:right;">${formatCurrency(total)}</td>
    </tr>`;
  });
  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Ni postavk za prikaz.</td></tr>`;

  const totals = context.totals ?? {};
  const totalRows = [
    { label: 'Skupaj brez DDV', value: totals.subtotal ?? 0 },
    { label: 'Popust', value: totals.discount ?? 0 },
    { label: 'DDV', value: totals.vat ?? 0 },
    { label: 'Skupaj z DDV', value: totals.total ?? totals.subtotal ?? 0 },
  ]
    .map(
      (row) => `<tr>
        <td colspan="3" style="text-align:right; font-weight:600;">${row.label}</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(row.value)}</td>
      </tr>`,
    )
    .join('');

  const commentBlock = context.comment
    ? `<div class="offer-comment">
        <h4>Komentar</h4>
        <p>${context.comment}</p>
      </div>`
    : '';

  const notesBlock = buildNotesList(context.notes);
  const metaExtras: string[] = [];
  if (context.validUntil) {
    metaExtras.push(`<p><span class="muted">Veljavnost:</span> ${new Date(context.validUntil).toLocaleDateString('sl-SI')}</p>`);
  }
  if (context.paymentTerms) {
    metaExtras.push(`<p><span class="muted">Rok plačila:</span> ${context.paymentTerms}</p>`);
  }

  return buildStandardDocument(context, {
    docLabel: 'Ponudba',
    pageTitle: 'Ponudba',
    projectTitleFallback: 'Predmet ponudbe',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji realne ponudbe.',
    metaExtras,
    tableHeadRows: `<tr>
        <th>Postavka</th>
        <th style="text-align:right;">Količina</th>
        <th style="text-align:right;">Cena</th>
        <th style="text-align:right;">Znesek</th>
      </tr>`,
    tableBodyRows: itemsRows,
    tableFooterRows: totalRows,
    commentBlock,
    notesBlock,
  });
}

export function renderInvoicePdf(context: DocumentPreviewContext) {
  const rows = (context.items ?? []).map((item) => {
    const unitPrice = item.unitPrice ?? 0;
    const total = item.total ?? unitPrice * item.quantity;
    return `<tr>
      <td>${item.name}</td>
      <td style="text-align:right;">${item.quantity}</td>
      <td style="text-align:right;">${item.unit ?? ''}</td>
      <td style="text-align:right;">${formatCurrency(unitPrice)}</td>
      <td style="text-align:right;">${(item.vatPercent ?? 22)}%</td>
      <td style="text-align:right;">${formatCurrency(total)}</td>
    </tr>`;
  });
  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Ni postavk za prikaz.</td></tr>`;

  const totals = context.totals ?? {};
  const totalRows = [
    { label: 'Osnova brez DDV', value: totals.subtotal ?? 0 },
    ...(totals.discount && totals.discount > 0 ? [{ label: 'Popust', value: totals.discount }] : []),
    { label: 'DDV', value: totals.vat ?? 0 },
    { label: 'Skupaj z DDV', value: totals.total ?? totals.subtotal ?? 0 },
  ]
    .map(
      (row) => `<tr>
        <td colspan="5" style="text-align:right; font-weight:600;">${row.label}</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(row.value)}</td>
      </tr>`,
    )
    .join('');

  const commentBlock = context.comment
    ? `<div class="offer-comment">
        <h4>Komentar</h4>
        <p>${context.comment}</p>
      </div>`
    : '';

  const notesBlock = buildNotesList(context.notes);
  const metaExtras: string[] = [];
  if (context.dueDate) {
    metaExtras.push(`<p><span class="muted">Rok plačila:</span> ${context.dueDate}</p>`);
  } else if (context.totals?.dueDays) {
    metaExtras.push(`<p><span class="muted">Rok plačila:</span> ${context.totals.dueDays} dni</p>`);
  }

  return buildStandardDocument(context, {
    docLabel: 'Račun',
    pageTitle: 'Racun',
    projectTitleFallback: 'Račun',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji računa.',
    metaExtras,
    tableHeadRows: `<tr>
        <th>Postavka</th>
        <th style="text-align:right;">Količina</th>
        <th style="text-align:right;">EM</th>
        <th style="text-align:right;">Cena</th>
        <th style="text-align:right;">DDV</th>
        <th style="text-align:right;">Znesek</th>
      </tr>`,
    tableBodyRows: itemsRows,
    tableFooterRows: totalRows,
    commentBlock,
    notesBlock,
  });
}

export function renderPurchaseOrderPdf(context: DocumentPreviewContext) {
  const rows = (context.items ?? []).map(
    (item) => `<tr>
        <td>${item.name}</td>
        <td style="text-align:right;">${item.quantity}</td>
        <td style="text-align:right;">${item.unit ?? ''}</td>
      </tr>`
  );
  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Ni postavk za prikaz.</td></tr>`;
  const notesBlock = buildNotesList(context.notes);

  return buildStandardDocument(context, {
    docLabel: 'Naročilnica',
    pageTitle: 'Narocilo',
    projectTitleFallback: 'Naročilo',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji naročilnice.',
    tableHeadRows: `<tr>
        <th>Postavka</th>
        <th style="text-align:right;">Količina</th>
        <th style="text-align:right;">Enota</th>
      </tr>`,
    tableBodyRows: itemsRows,
    notesBlock,
  });
}

export function renderDeliveryNotePdf(context: DocumentPreviewContext) {
  const rows = (context.items ?? []).map(
    (item) => `<tr>
        <td>${item.name}</td>
        <td style="text-align:right;">${item.quantity}</td>
        <td style="text-align:right;">${item.unit ?? ''}</td>
      </tr>`
  );
  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Ni postavk za prikaz.</td></tr>`;
  const notesBlock = buildNotesList(context.notes);
  const extraSections = buildSignatureBlock({ leftLabel: 'Izročil', rightLabel: 'Prevzel' });

  return buildStandardDocument(context, {
    docLabel: 'Dobavnica',
    pageTitle: 'Dobavnica',
    projectTitleFallback: 'Dobavnica',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji dobavnice.',
    tableHeadRows: `<tr>
        <th>Postavka</th>
        <th style="text-align:right;">Količina</th>
        <th style="text-align:right;">Enota</th>
      </tr>`,
    tableBodyRows: itemsRows,
    notesBlock,
    extraSections,
  });
}

export function renderWorkOrderPdf(context: DocumentPreviewContext) {
  const tasks = context.tasks ?? (context.items ?? []).map((item) => ({ label: item.name, status: 'todo' as const }));
  const rows = tasks.map(
    (task) => `<tr>
        <td>${task.label}</td>
        <td style="text-align:right;">${task.status ?? ''}</td>
      </tr>`
  );
  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="2" style="text-align:center; color:#94a3b8;">Ni nalog za prikaz.</td></tr>`;
  const notesBlock = buildNotesList(context.notes);
  const commentBlock = context.comment
    ? `<div class="offer-comment">
        <h4>Izvedba</h4>
        <p>${context.comment}</p>
      </div>`
    : '';

  return buildStandardDocument(context, {
    docLabel: 'Delovni nalog',
    pageTitle: 'Delovni nalog',
    projectTitleFallback: 'Delovni nalog',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji naloga.',
    tableHeadRows: `<tr>
        <th>Naloga</th>
        <th style="text-align:right;">Status</th>
      </tr>`,
    tableBodyRows: itemsRows,
    commentBlock,
    notesBlock,
  });
}

export function renderWorkOrderConfirmationPdf(context: DocumentPreviewContext) {
  const tasks = context.tasks ?? (context.items ?? []).map((item) => ({ label: item.name, status: 'done' as const }));
  const rows = tasks.map(
    (task) => `<tr>
        <td>${task.label}</td>
        <td style="text-align:right;">${task.status ?? ''}</td>
      </tr>`
  );
  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="2" style="text-align:center; color:#94a3b8;">Ni nalog za prikaz.</td></tr>`;
  const notesBlock = buildNotesList(context.notes);
  const confirmationText = `<div class="offer-comment">
      <h4>Potrditev izvedbe</h4>
      <p>Dela so bila izvedena skladno z dogovorjenimi specifikacijami.</p>
    </div>`;
  const extraSections = `${confirmationText}${buildSignatureBlock({ leftLabel: 'Izvajalec', rightLabel: 'Naročnik' })}`;

  return buildStandardDocument(context, {
    docLabel: 'Potrdilo del. naloga',
    pageTitle: 'Potrdilo delovnega naloga',
    projectTitleFallback: 'Potrdilo delovnega naloga',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji potrdila.',
    tableHeadRows: `<tr>
        <th>Naloga</th>
        <th style="text-align:right;">Status</th>
      </tr>`,
    tableBodyRows: itemsRows,
    notesBlock,
    extraSections,
  });
}

export function renderCreditNotePdf(context: DocumentPreviewContext) {
  const rows = (context.items ?? []).map((item) => {
    const unitPrice = -(item.unitPrice ?? 0);
    const total = -(item.total ?? (item.unitPrice ?? 0) * item.quantity);
    return `<tr>
        <td>${item.name}</td>
        <td style="text-align:right;">${item.quantity}</td>
        <td style="text-align:right;">${unitPrice.toFixed(2)} €</td>
        <td style="text-align:right;">${total.toFixed(2)} €</td>
      </tr>`;
  });

  const itemsRows = rows.length
    ? rows.join('')
    : `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Ni postavk za prikaz.</td></tr>`;

  const totals = context.totals ?? {};
  const totalRows = [
    { label: 'Osnova brez DDV', value: -(totals.subtotal ?? 0) },
    { label: 'DDV', value: -(totals.vat ?? 0) },
    { label: 'Skupaj z DDV', value: -(totals.total ?? 0) },
  ]
    .map(
      (row) => `<tr>
        <td colspan="3" style="text-align:right; font-weight:600;">${row.label}</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(row.value)}</td>
      </tr>`,
    )
    .join('');

  const referenceBlock = context.referenceNumber
    ? `<div class="offer-comment">
        <h4>Referenca računa</h4>
        <p>${context.referenceNumber}</p>
      </div>`
    : '';
  const notesBlock = buildNotesList(context.notes);

  return buildStandardDocument(context, {
    docLabel: 'Dobropis',
    pageTitle: 'Dobropis',
    projectTitleFallback: 'Dobropis',
    customerEmptyText: 'Podatki o stranki se prikažejo ob izdaji dobropisa.',
    metaExtras: context.paymentTerms ? [`<p><span class="muted">Rok plačila:</span> ${context.paymentTerms}</p>`] : [],
    tableHeadRows: `<tr>
        <th>Postavka</th>
        <th style="text-align:right;">Količina</th>
        <th style="text-align:right;">Cena</th>
        <th style="text-align:right;">Znesek</th>
      </tr>`,
    tableBodyRows: itemsRows,
    tableFooterRows: totalRows,
    commentBlock: referenceBlock,
    notesBlock,
  });
}

const DOC_RENDERERS: Record<DocumentNumberingKind, (context: DocumentPreviewContext) => string> = {
  OFFER: renderOfferPdf,
  INVOICE: renderInvoicePdf,
  PURCHASE_ORDER: renderPurchaseOrderPdf,
  DELIVERY_NOTE: renderDeliveryNotePdf,
  WORK_ORDER: renderWorkOrderPdf,
  WORK_ORDER_CONFIRMATION: renderWorkOrderConfirmationPdf,
  CREDIT_NOTE: renderCreditNotePdf,
};

export function renderDocumentHtml(context: DocumentPreviewContext) {
  const renderer = DOC_RENDERERS[context.docType] ?? renderOfferPdf;
  return renderer(context);
}

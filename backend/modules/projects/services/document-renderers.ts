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

export interface DocumentPreviewContext {
  docType: DocumentNumberingKind;
  documentNumber: string;
  issueDate: string;
  validUntil?: string | null;
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
  .offer-signature { max-width:280px; margin-left:auto; text-align:right; color:#475569; break-inside:avoid; font-size:11px; padding-top:18px; }
  .offer-signature p { margin:4px 0; }
  .offer-signature-line { border-bottom:1px solid #cbd5e1; margin-top:18px; margin-left:auto; width:220px; }
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

export function renderOfferPdf(context: DocumentPreviewContext) {
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

  const customerLines = context.customer
    ? [
        context.customer.taxId ? `<p>Davčna: ${context.customer.taxId}</p>` : '',
        context.customer.name ? `<p>${context.customer.name}</p>` : '',
        context.customer.address
          ? context.customer.address
              .split(/\n|,\s*/)
              .map((line) => `<p>${line.trim()}</p>`)
              .join('')
          : '',
      ].join('')
    : `<p class="muted">Podatki o stranki se prikažejo ob izdaji realne ponudbe.</p>`;

  const metaRows = [
    `<p><span class="muted">Dokument:</span> Ponudba</p>`,
    `<p><span class="muted">Št.:</span> ${context.documentNumber}</p>`,
    `<p><span class="muted">Datum:</span> ${context.issueDate}</p>`,
  ];
  if (context.validUntil) {
    metaRows.push(`<p><span class="muted">Veljavnost:</span> ${new Date(context.validUntil).toLocaleDateString('sl-SI')}</p>`);
  }
  if (context.paymentTerms) {
    metaRows.push(`<p><span class="muted">Rok plačila:</span> ${context.paymentTerms}</p>`);
  }

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

  const notesBlock =
    context.notes && context.notes.length
      ? `<div class="offer-notes">
          <p style="font-weight:600;">Opombe</p>
          <ul>${context.notes.map((note) => `<li>${note}</li>`).join('')}</ul>
        </div>`
      : '';

  const signatureName = context.company.directorName
    ? `Direktor: ${context.company.directorName}`
    : 'Dodajte direktorja v nastavitvah podjetja.';

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
            ${metaRows.join('')}
          </div>
        </div>

        <div class="offer-project-title">
          <h3 style="font-size:18px; font-weight:600; margin-bottom:4px;">${context.projectTitle ?? 'Predmet ponudbe'}</h3>
        </div>

        <table class="offer-table">
          <thead>
            <tr>
              <th>Postavka</th>
              <th style="text-align:right;">Količina</th>
              <th style="text-align:right;">Cena</th>
              <th style="text-align:right;">Znesek</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
          <tfoot>${totalRows}</tfoot>
        </table>

        ${commentBlock}
        ${notesBlock}

        <div class="offer-bottom">
          <div class="offer-signature">
            <p style="font-weight:600;">Podpis</p>
            <p>${signatureName}</p>
            <div class="offer-signature-line"></div>
          </div>

          <div class="offer-footer">
            ${contactLine}
            ${financeLine}
          </div>
        </div>
      </div>
    </div>`;

  return wrapDocument('Ponudba', body);
}

export function renderInvoicePdf(context: DocumentPreviewContext) {
  const header = buildHeaderHtml(context.company, {
    title: 'Racun',
    documentNumber: context.documentNumber,
    issueDate: context.issueDate,
    customer: context.customer,
    projectTitle: context.projectTitle,
  });

  const rows = (context.items ?? []).map((item) => {
    const unitPrice = item.unitPrice ?? 0;
    const total = item.total ?? unitPrice * item.quantity;
    return `<tr>
        <td>${item.name}</td>
        <td style="text-align:right;">${item.quantity}</td>
        <td style="text-align:right;">${unitPrice.toFixed(2)} €</td>
        <td style="text-align:right;">${(item.vatPercent ?? 22)}%</td>
        <td style="text-align:right;">${total.toFixed(2)} €</td>
      </tr>`;
  });

  const totals = context.totals;
  const totalsBlock = totals
    ? `<div class="totals">
        <div class="totals-row"><span>Osnova</span><span>${(totals.subtotal ?? 0).toFixed(2)} €</span></div>
        <div class="totals-row"><span>DDV</span><span>${(totals.vat ?? 0).toFixed(2)} €</span></div>
        <div class="totals-row"><span>Skupaj</span><span>${(totals.total ?? 0).toFixed(2)} €</span></div>
        ${totals.dueDays ? `<div class="totals-row"><span>Rok placila</span><span>${totals.dueDays} dni</span></div>` : ''}
      </div>`
    : '';

  const body = `${header}
    <h3 style="margin-top:16px;">Postavke</h3>
    <table style="margin-top:12px;">
      <thead>
        <tr><th>Postavka</th><th style="text-align:right;">Kolicina</th><th style="text-align:right;">Cena</th><th style="text-align:right;">DDV</th><th style="text-align:right;">Znesek</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${totalsBlock}
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Izdal', rightLabel: 'Placnik' })}
    ${buildFooterHtml(context.company)}`;

  return wrapDocument('Racun', body);
}

export function renderPurchaseOrderPdf(context: DocumentPreviewContext) {
  const header = buildHeaderHtml(context.company, {
    title: 'Narocilo',
    documentNumber: context.documentNumber,
    issueDate: context.issueDate,
    customer: context.customer,
    projectTitle: context.projectTitle,
  });

  const rows = (context.items ?? []).map(
    (item) => `<tr><td>${item.name}</td><td style="text-align:right;">${item.quantity}</td><td>${item.unit ?? ''}</td></tr>`
  );

  const body = `${header}
    <h3 style="margin-top:16px;">Naročene kolicine</h3>
    <table style="margin-top:12px;">
      <thead>
        <tr><th>Postavka</th><th style="text-align:right;">Kolicina</th><th>EM</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Naročil', rightLabel: 'Dobavitelj' })}
    ${buildFooterHtml(context.company)}`;

  return wrapDocument('Narocilo', body);
}

export function renderDeliveryNotePdf(context: DocumentPreviewContext) {
  const header = buildHeaderHtml(context.company, {
    title: 'Dobavnica',
    documentNumber: context.documentNumber,
    issueDate: context.issueDate,
    customer: context.customer,
    projectTitle: context.projectTitle,
  });

  const rows = (context.items ?? []).map(
    (item) => `<tr><td>${item.name}</td><td style="text-align:right;">${item.quantity}</td><td>${item.unit ?? ''}</td></tr>`
  );

  const body = `${header}
    <h3 style="margin-top:16px;">Dobavljeno</h3>
    <table style="margin-top:12px;">
      <thead>
        <tr><th>Postavka</th><th style="text-align:right;">Kolicina</th><th>EM</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Oddal', rightLabel: 'Prevzel' })}
    ${buildFooterHtml(context.company)}`;

  return wrapDocument('Dobavnica', body);
}

export function renderWorkOrderPdf(context: DocumentPreviewContext) {
  const header = buildHeaderHtml(context.company, {
    title: 'Delovni nalog',
    documentNumber: context.documentNumber,
    issueDate: context.issueDate,
    customer: context.customer,
    projectTitle: context.projectTitle,
  });

  const tasks = context.tasks ?? (context.items ?? []).map((item) => ({ label: item.name, status: 'todo' as const }));
  const taskList = tasks
    .map(
      (task) =>
        `<div class="task"><input type="checkbox" ${task.status === 'done' ? 'checked' : ''} /><span>${task.label}</span><span class="badge">${task.status ?? 'todo'}</span></div>`
    )
    .join('');

  const body = `${header}
    <div class="tasks">
      <h3>Naloge</h3>
      ${taskList}
    </div>
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Tehnik', rightLabel: 'Stranka' })}
    ${buildFooterHtml(context.company)}`;

  return wrapDocument('Delovni nalog', body);
}

export function renderWorkOrderConfirmationPdf(context: DocumentPreviewContext) {
  const header = buildHeaderHtml(context.company, {
    title: 'Potrdilo delovnega naloga',
    documentNumber: context.documentNumber,
    issueDate: context.issueDate,
    customer: context.customer,
    projectTitle: context.projectTitle,
  });

  const tasks = context.tasks ?? (context.items ?? []).map((item) => ({ label: item.name, status: 'done' as const }));
  const taskList = tasks
    .map(
      (task) =>
        `<div class="task" style="border-color:#d1fae5;background:#ecfdf3;"><span style="width:12px;height:12px;border-radius:50%;background:#22c55e;display:inline-block;"></span><span>${task.label}</span><span class="badge">${task.status ?? 'done'}</span></div>`
    )
    .join('');

  const body = `${header}
    <div class="tasks">
      <h3>Izvedene naloge</h3>
      ${taskList}
    </div>
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Izvajalec', rightLabel: 'Naročnik' })}
    ${buildFooterHtml(context.company)}`;

  return wrapDocument('Potrdilo delovnega naloga', body);
}

export function renderCreditNotePdf(context: DocumentPreviewContext) {
  const header = buildHeaderHtml(context.company, {
    title: 'Dobropis',
    documentNumber: context.documentNumber,
    issueDate: context.issueDate,
    customer: context.customer,
    projectTitle: context.projectTitle,
  });

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

  const totals = context.totals;
  const totalsBlock = totals
    ? `<div class="totals">
        <div class="totals-row"><span>Osnova</span><span>${(-1 * (totals.subtotal ?? 0)).toFixed(2)} €</span></div>
        <div class="totals-row"><span>DDV</span><span>${(-1 * (totals.vat ?? 0)).toFixed(2)} €</span></div>
        <div class="totals-row"><span>Skupaj</span><span>${(-1 * (totals.total ?? 0)).toFixed(2)} €</span></div>
      </div>`
    : '';

  const reference = context.referenceNumber
    ? `<div class="notes"><strong>Referenca racuna</strong><p class="muted">${context.referenceNumber}</p></div>`
    : '';

  const body = `${header}
    ${reference}
    <table style="margin-top:12px;">
      <thead>
        <tr><th>Postavka</th><th style="text-align:right;">Kolicina</th><th style="text-align:right;">Cena</th><th style="text-align:right;">Znesek</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${totalsBlock}
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Izdal', rightLabel: 'Prejel' })}
    ${buildFooterHtml(context.company)}`;

  return wrapDocument('Dobropis', body);
}

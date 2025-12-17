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
  company: PdfCompanySettings;
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
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 0; }
  .page { width: 794px; margin: 24px auto; background: #fff; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-radius: 12px; }
  h1, h2, h3, h4 { margin: 0; }
  .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; }
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
  const header = buildHeaderHtml(context.company, {
    title: 'Ponudba',
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
        <td style="text-align:right;">${total.toFixed(2)} €</td>
      </tr>`;
  });

  const totals = context.totals;
  const totalsBlock = totals
    ? `<div class="totals">
        <div class="totals-row"><span>Skupaj brez DDV</span><span>${(totals.subtotal ?? 0).toFixed(2)} €</span></div>
        <div class="totals-row"><span>Popust</span><span>${(totals.discount ?? 0).toFixed(2)} €</span></div>
        <div class="totals-row"><span>DDV</span><span>${(totals.vat ?? 0).toFixed(2)} €</span></div>
        <div class="totals-row"><span>Skupaj z DDV</span><span>${(totals.total ?? 0).toFixed(2)} €</span></div>
      </div>`
    : '';

  const commentBlock = context.comment
    ? `<div class="notes" style="background:#fff7ed;border-color:#fed7aa;">
        <strong>Komentar</strong>
        <p class="muted" style="margin-top:6px;">${context.comment}</p>
      </div>`
    : '';

  const body = `${header}
    <h3 style="margin-top:16px;">Predmet</h3>
    <p class="muted">${context.projectTitle ?? 'Predmet ponudbe'}</p>
    <table style="margin-top:12px;">
      <thead>
        <tr><th>Postavka</th><th style="text-align:right;">Kolicina</th><th style="text-align:right;">Cena</th><th style="text-align:right;">Znesek</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${totalsBlock}
    ${commentBlock}
    ${buildNotesBlockHtml(context.notes)}
    ${buildSignatureBlock({ leftLabel: 'Ponudnik', rightLabel: 'Naročnik' })}
    ${buildFooterHtml(context.company)}`;

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

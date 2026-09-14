import { createHash } from 'crypto';
import { Types } from 'mongoose';
import type { CreditNote, CreditNoteItem, CreditNoteOptions } from '../../../../shared/types/credit-notes';
import { ProjectModel } from '../schemas/project';
import { FinanceSnapshotModel } from '../../finance/schemas/finance-snapshot';
import { generateDocumentNumber } from './document-numbering.service';

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const quantityRound = (value: number) => Math.round(value * 1e6) / 1e6;
const publicNote = ({ finance, requestId, payloadHash, ...note }: any): CreditNote => note;

async function source(projectId: string, invoiceVersionId: string) {
  const project = await ProjectModel.findOne({ id: projectId }).lean();
  const invoice = project?.invoiceVersions?.find((entry: any) => String(entry._id) === invoiceVersionId);
  if (!project || !invoice || invoice.status !== 'issued') throw new Error('Dobropis lahko ustvariš samo za izdan račun.');
  const snapshot = await FinanceSnapshotModel.findOne({ projectId, invoiceVersionId, superseded: { $ne: true } }).lean();
  if (!snapshot) throw new Error('Račun nima finančnega zapisa. Pred izdajo dobropisa je treba urediti finančne podatke računa.');
  return { project, invoice, snapshot };
}

function returnedQuantity(notes: any[], itemId: string) {
  return quantityRound(notes.reduce((sum, note) => sum + note.items.filter((item: CreditNoteItem) => item.invoiceItemId === itemId)
    .reduce((subtotal: number, item: CreditNoteItem) => subtotal + item.quantity, 0), 0));
}

export async function getCreditNoteOptions(projectId: string, invoiceVersionId: string): Promise<CreditNoteOptions> {
  const { invoice, snapshot } = await source(projectId, invoiceVersionId);
  const notes = snapshot.creditNotes ?? [];
  const creditedAmount = round(notes.reduce((sum, note) => sum + note.summary.totalWithVat, 0));
  return {
    invoiceNumber: invoice.invoiceNumber, notes: notes.map(publicNote), creditedAmount,
    netTotalWithVat: round(invoice.summary.totalWithVat - creditedAmount),
    items: invoice.items.map((item: any, index: number) => ({
      id: item.id, name: item.name, unit: item.unit, invoiceQuantity: item.quantity,
      remainingQuantity: quantityRound(item.quantity - returnedQuantity(notes, item.id)),
      isService: snapshot.items[index]?.isService,
    })).filter((item: any) => item.invoiceQuantity > 0 && !item.isService)
      .map(({ isService, ...item }: any) => item),
  };
}

function calculate(sourceData: Awaited<ReturnType<typeof source>>, input: any) {
  const { invoice, snapshot } = sourceData;
  if (typeof input?.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 2000) {
    throw new Error('Vnesi razlog dobropisa (največ 2000 znakov).');
  }
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > invoice.items.length) {
    throw new Error('Izberi vsaj eno vrnjeno postavko.');
  }
  const seen = new Set<string>();
  const financeItems: any[] = [];
  const items: CreditNoteItem[] = input.items.map((selection: any) => {
    const index = invoice.items.findIndex((item: any) => item.id === selection.invoiceItemId);
    const original = invoice.items[index];
    const financeItem = snapshot.items[index];
    const quantity = selection.quantity;
    if (!original || !financeItem || financeItem.name !== original.name || financeItem.isService) throw new Error('Vrnjena postavka ni veljavna postavka blaga na računu.');
    if (seen.has(original.id)) throw new Error('Ista postavka je izbrana večkrat.');
    seen.add(original.id);
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantityRound(quantity) !== quantity || original.quantity <= 0) {
      throw new Error('Vnesi veljavno pozitivno vrnjeno količino (največ 6 decimalnih mest).');
    }
    const previous = returnedQuantity(snapshot.creditNotes ?? [], original.id);
    const cumulative = quantityRound(previous + quantity);
    if (cumulative > original.quantity) throw new Error(`Za postavko ${original.name} vračilo presega preostalo količino.`);
    // Cumulative rounding makes partial returns add up exactly to the issued line,
    // including its allocated document discounts and VAT rounding cents.
    const part = (total: number) => round(round(total * cumulative / original.quantity) - round(total * previous / original.quantity));
    const totalWithoutVat = part(original.totalWithoutVat);
    const vatAmount = part(round(original.totalWithVat - original.totalWithoutVat));
    const totalWithVat = round(totalWithoutVat + vatAmount);
    const purchase = part(financeItem.totalPurchase);
    financeItems.push({ ...financeItem, quantity: -quantity, totalSale: -totalWithoutVat, totalPurchase: -purchase, margin: round(purchase - totalWithoutVat) });
    return { invoiceItemId: original.id, name: original.name, unit: original.unit, quantity, vatPercent: original.vatPercent, totalWithoutVat, vatAmount, totalWithVat };
  });
  const summary = {
    totalWithoutVat: round(items.reduce((sum, item) => sum + item.totalWithoutVat, 0)),
    vatAmount: round(items.reduce((sum, item) => sum + item.vatAmount, 0)),
    totalWithVat: round(items.reduce((sum, item) => sum + item.totalWithVat, 0)),
  };
  const payloadHash = createHash('sha256').update(JSON.stringify({ reason: input.reason.trim(), items: input.items.slice().sort((a: any, b: any) => a.invoiceItemId.localeCompare(b.invoiceItemId)) })).digest('hex');
  return { items, summary, reason: input.reason.trim(), financeItems, payloadHash };
}

export async function previewCreditNote(projectId: string, invoiceVersionId: string, input: unknown) {
  const data = await source(projectId, invoiceVersionId);
  const { items, summary, reason } = calculate(data, input);
  return { items, summary, reason, invoiceNumber: data.invoice.invoiceNumber };
}

export async function issueCreditNote(projectId: string, invoiceVersionId: string, input: any, actor: { name: string; userId?: string | null }) {
  if (typeof input?.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(input.requestId)) throw new Error('Manjka veljaven identifikator zahteve.');
  let numbering: Awaited<ReturnType<typeof generateDocumentNumber>> | undefined;
  const id = new Types.ObjectId().toString();
  const issuedAt = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const data = await source(projectId, invoiceVersionId);
    const existing = (data.snapshot.creditNotes ?? []).find((note) => note.requestId === input.requestId);
    if (existing) return publicNote(existing);
    const calculated = calculate(data, input);
    numbering ??= await generateDocumentNumber('CREDIT_NOTE', issuedAt);
    const totalPurchase = round(calculated.financeItems.reduce((sum, item) => sum + item.totalPurchase, 0));
    const note = {
      id, number: numbering.number, invoiceVersionId, invoiceNumber: data.invoice.invoiceNumber,
      issuedAt: issuedAt.toISOString(), issuedBy: actor.name, issuedByUserId: actor.userId ?? null,
      reason: calculated.reason, customer: data.snapshot.customer, items: calculated.items, summary: calculated.summary,
      requestId: input.requestId, payloadHash: calculated.payloadHash,
      finance: {
        _id: id, projectId, invoiceVersionId: id, invoiceNumber: numbering.number, documentType: 'credit_note',
        sourceInvoiceVersionId: invoiceVersionId, sourceInvoiceNumber: data.invoice.invoiceNumber,
        issuedAt, createdAt: issuedAt, updatedAt: issuedAt, customer: data.snapshot.customer,
        items: calculated.financeItems, summary: {
          totalSaleWithoutVat: -calculated.summary.totalWithoutVat, totalVat: -calculated.summary.vatAmount,
          totalSaleWithVat: -calculated.summary.totalWithVat, totalPurchase,
          totalMargin: round(-calculated.summary.totalWithoutVat - totalPurchase),
        },
        assignedEmployeeIds: [], employeeEarnings: [], salesUserId: data.snapshot.salesUserId,
        offerVersionId: data.snapshot.offerVersionId, superseded: false, snapshotVersion: 1,
      },
    };
    // The credit document and its financial entry are one atomic Mongo write.
    const saved = await FinanceSnapshotModel.updateOne({
      _id: data.snapshot._id, superseded: { $ne: true },
      $expr: { $eq: [{ $size: { $ifNull: ['$creditNotes', []] } }, (data.snapshot.creditNotes ?? []).length] },
    }, { $push: { creditNotes: note } });
    if (saved.modifiedCount === 1) return publicNote(note);
  }
  throw new Error('Račun se je med izdajo spremenil. Osveži podatke in poskusi znova.');
}

export async function getCreditNote(projectId: string, invoiceVersionId: string, noteId: string) {
  const { snapshot } = await source(projectId, invoiceVersionId);
  const note = (snapshot.creditNotes ?? []).find((entry) => entry.id === noteId);
  if (!note) throw new Error('Dobropis ni najden.');
  return publicNote(note);
}

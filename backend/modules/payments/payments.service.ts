import { ProjectModel } from '../projects/schemas/project';
import { InvoicePaymentModel, type InvoicePaymentDocument } from './invoice-payment.model';

// Toleranca pri primerjavi zneskov (zaokrožitve, bančne provizije ipd.).
const TOLERANCA_EUR = 0.01;

export type PaymentState = 'unpaid' | 'partial' | 'paid';

export class PaymentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function paymentStateFor(totalWithVat: number, paidAmount: number): PaymentState {
  if (paidAmount >= totalWithVat - TOLERANCA_EUR && totalWithVat > 0) return 'paid';
  if (paidAmount > TOLERANCA_EUR) return 'partial';
  return 'unpaid';
}

/** Vsota POTRJENIH plačil po številkah računov — za obogatitev seznamov računov. */
export async function confirmedPaymentsByInvoiceNumber(
  invoiceNumbers: string[],
): Promise<Map<string, { paidAmount: number; lastPaymentAt: Date | null }>> {
  const numbers = invoiceNumbers.filter(Boolean);
  if (!numbers.length) return new Map();
  const rows = await InvoicePaymentModel.aggregate([
    { $match: { status: 'confirmed', invoiceNumber: { $in: numbers } } },
    { $group: { _id: '$invoiceNumber', paidAmount: { $sum: '$amount' }, lastPaymentAt: { $max: '$receivedAt' } } },
  ]);
  return new Map(
    rows.map((row: { _id: string; paidAmount: number; lastPaymentAt: Date | null }) => [
      row._id,
      { paidAmount: Math.round(row.paidAmount * 100) / 100, lastPaymentAt: row.lastPaymentAt ?? null },
    ]),
  );
}

interface IssuedInvoiceRef {
  projectId: string;
  invoiceVersionId: string;
  invoiceNumber: string;
  totalWithVat: number;
}

/** Poišče izdan (ne stornirán) račun po številki. Vrne napako, če ga ni. */
async function findIssuedInvoice(invoiceNumber: string): Promise<IssuedInvoiceRef> {
  const number = invoiceNumber.trim();
  if (!number) {
    throw new PaymentError('Manjka številka računa.');
  }
  const project = await ProjectModel.findOne({
    invoiceVersions: { $elemMatch: { invoiceNumber: number, status: 'issued' } },
  })
    .select({ id: 1, invoiceVersions: 1 })
    .lean();
  const version = (project?.invoiceVersions ?? []).find(
    (entry: any) => entry?.invoiceNumber === number && entry?.status === 'issued',
  );
  if (!project || !version) {
    throw new PaymentError(`Izdan račun ${number} ne obstaja.`, 404);
  }
  return {
    projectId: project.id,
    invoiceVersionId: String(version._id ?? ''),
    invoiceNumber: number,
    totalWithVat: Number(version.summary?.totalWithVat ?? 0),
  };
}

function sanitizeAmount(value: unknown): number {
  const amount = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentError('Znesek plačila mora biti pozitivno število.');
  }
  return Math.round(amount * 100) / 100;
}

function sanitizeDate(value: unknown): Date {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) {
    throw new PaymentError('Neveljaven datum plačila.');
  }
  return date;
}

/** Ročni vnos: plačilo je takoj potrjeno in šteje v plačano. */
export async function recordManualPayment(input: {
  invoiceNumber: string;
  amount: unknown;
  receivedAt?: unknown;
  note?: unknown;
  actorUserId?: string | null;
}): Promise<InvoicePaymentDocument> {
  const invoice = await findIssuedInvoice(String(input.invoiceNumber ?? ''));
  const amount = sanitizeAmount(input.amount);
  const receivedAt = sanitizeDate(input.receivedAt);
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;

  return InvoicePaymentModel.create({
    projectId: invoice.projectId,
    invoiceVersionId: invoice.invoiceVersionId,
    invoiceNumber: invoice.invoiceNumber,
    amount,
    receivedAt,
    source: 'manual',
    status: 'confirmed',
    note,
    createdByUserId: input.actorUserId ?? null,
    confirmedByUserId: input.actorUserId ?? null,
    confirmedAt: new Date(),
  });
}

/** Potrdi plačilo (iz bančnega maila): po potrebi popravi račun, nato šteje v plačano. */
export async function confirmPayment(
  paymentId: string,
  input: { invoiceNumber?: unknown; actorUserId?: string | null },
): Promise<InvoicePaymentDocument> {
  const payment = await InvoicePaymentModel.findById(paymentId);
  if (!payment) {
    throw new PaymentError('Plačilo ne obstaja.', 404);
  }
  if (payment.status === 'confirmed') {
    return payment;
  }
  const requestedNumber = typeof input.invoiceNumber === 'string' && input.invoiceNumber.trim()
    ? input.invoiceNumber.trim()
    : payment.invoiceNumber ?? '';
  const invoice = await findIssuedInvoice(requestedNumber);

  payment.projectId = invoice.projectId;
  payment.invoiceVersionId = invoice.invoiceVersionId;
  payment.invoiceNumber = invoice.invoiceNumber;
  payment.status = 'confirmed';
  payment.confirmedByUserId = input.actorUserId ?? null;
  payment.confirmedAt = new Date();
  await payment.save();
  return payment;
}

/** Izbris napačnega zapisa (napačen ročni vnos ali napačno prebran bančni mail). */
export async function deletePayment(paymentId: string): Promise<boolean> {
  const deleted = await InvoicePaymentModel.findByIdAndDelete(paymentId);
  return !!deleted;
}

export async function listPayments(filter: { status?: string; invoiceNumber?: string; limit?: number }) {
  const query: Record<string, unknown> = {};
  if (filter.status && ['unmatched', 'suggested', 'confirmed'].includes(filter.status)) {
    query.status = filter.status;
  }
  if (filter.invoiceNumber) {
    query.invoiceNumber = filter.invoiceNumber;
  }
  const limit = Math.min(500, Math.max(1, filter.limit ?? 200));
  return InvoicePaymentModel.find(query).sort({ receivedAt: -1 }).limit(limit).lean();
}

/** Plačila, ki čakajo človeka (neujeta + predlagana) — za opozorilo v Financah. */
export async function countOpenPayments(): Promise<number> {
  return InvoicePaymentModel.countDocuments({ status: { $in: ['unmatched', 'suggested'] } });
}

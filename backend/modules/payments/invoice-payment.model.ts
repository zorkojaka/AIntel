import mongoose, { Document, Model, Schema } from 'mongoose';

// Plačila računov živijo v LASTNI zbirki in se z računi ujemajo po številki
// računa (invoiceNumber). V vgnezdeni seznam invoiceVersions na projektu
// namerno ne pišemo — je netipiziran (Mixed) in nosi denarne podatke.

export type InvoicePaymentSource = 'manual' | 'bank_email';

/**
 * suggested = plačilo (iz bančnega maila) s predlaganim računom, čaka potrditev;
 * unmatched = plačilo brez najdenega računa; confirmed = šteje v plačano.
 */
export type InvoicePaymentStatus = 'unmatched' | 'suggested' | 'confirmed';

export interface InvoicePaymentDocument extends Document {
  projectId?: string | null;
  invoiceVersionId?: string | null;
  invoiceNumber?: string | null;
  amount: number;
  currency: string;
  receivedAt: Date;
  payerName?: string | null;
  /** Sklic (referenca) s plačila — osnova za samodejno ujemanje. */
  reference?: string | null;
  source: InvoicePaymentSource;
  /** Vez na zapis dohodne pošte (email_messages) — zagotavlja idempotenten uvoz. */
  emailMessageId?: string | null;
  status: InvoicePaymentStatus;
  note?: string | null;
  createdByUserId?: string | null;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const InvoicePaymentSchema = new Schema<InvoicePaymentDocument>(
  {
    projectId: { type: String, default: null, index: true },
    invoiceVersionId: { type: String, default: null },
    invoiceNumber: { type: String, default: null, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, default: 'EUR' },
    receivedAt: { type: Date, required: true },
    payerName: { type: String, default: null },
    reference: { type: String, default: null },
    source: { type: String, required: true, enum: ['manual', 'bank_email'] },
    // default undefined (ne null!) — unikatni sparse indeks null vrednosti šteje,
    // manjkajočih pa ne; ročna plačila polja sploh ne smejo imeti.
    emailMessageId: { type: String, default: undefined },
    status: { type: String, required: true, enum: ['unmatched', 'suggested', 'confirmed'], default: 'confirmed' },
    note: { type: String, default: null },
    createdByUserId: { type: String, default: null },
    confirmedByUserId: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false, collection: 'invoice_payments' }
);

InvoicePaymentSchema.index({ status: 1, receivedAt: -1 });
InvoicePaymentSchema.index({ emailMessageId: 1 }, { unique: true, sparse: true });

export const InvoicePaymentModel: Model<InvoicePaymentDocument> =
  (mongoose.models.InvoicePayment as Model<InvoicePaymentDocument>) ||
  mongoose.model<InvoicePaymentDocument>('InvoicePayment', InvoicePaymentSchema);

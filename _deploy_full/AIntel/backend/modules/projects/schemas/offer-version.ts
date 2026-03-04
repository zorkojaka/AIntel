import mongoose, { Document, Model, Schema } from 'mongoose';
import type { OfferLineItem, OfferStatus, OfferVersion as OfferVersionType } from '../../../../shared/types/offers';

export interface OfferLineItemDocument extends Document, OfferLineItem {
  id: string;
}

const OfferLineItemSchema = new Schema<OfferLineItemDocument>(
  {
    id: { type: String, required: true },
    productId: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unit: { type: String, required: true, trim: true, default: 'kos' },
    unitPrice: { type: Number, required: true, min: 0 },
    vatRate: { type: Number, required: true, min: 0, max: 100 },
    totalNet: { type: Number, required: true, min: 0 },
    totalVat: { type: Number, required: true, min: 0 },
    totalGross: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0 },
    casovnaNorma: { type: Number, default: 0 },
    dobavitelj: { type: String, trim: true, default: '' },
    naslovDobavitelja: { type: String, trim: true, default: '' },
  } as Record<keyof OfferLineItem, any>,
  { _id: false }
);

export interface OfferVersionDocument extends Omit<OfferVersionType, '_id'>, Document {
  _id: string;
}

const OfferVersionSchema = new Schema<OfferVersionDocument>(
  {
    projectId: { type: String, required: true, index: true },
    baseTitle: { type: String, required: true },
    versionNumber: { type: Number, required: true },
    title: { type: String, required: true },
    documentNumber: { type: String, default: null },
    validUntil: { type: Date, default: null },
    paymentTerms: { type: String, default: null },
    sentAt: { type: Date, default: null },
    sentByUserId: { type: String, default: null },
    sentVia: { type: String, default: null },
    comment: { type: String, default: null },
    items: { type: [OfferLineItemSchema], default: [] },
    totalNet: { type: Number, required: true, default: 0 },
    totalVat22: { type: Number, required: true, default: 0 },
    totalVat95: { type: Number, required: true, default: 0 },
    totalVat: { type: Number, required: true, default: 0 },
    totalGross: { type: Number, required: true, default: 0 },
    discountPercent: { type: Number, required: true, default: 0 },
    globalDiscountPercent: { type: Number, required: true, default: 0 },
    discountAmount: { type: Number, required: true, default: 0 },
    totalNetAfterDiscount: { type: Number, required: true, default: 0 },
    totalGrossAfterDiscount: { type: Number, required: true, default: 0 },
    useGlobalDiscount: { type: Boolean, required: true, default: true },
    usePerItemDiscount: { type: Boolean, required: true, default: false },
    vatMode: { type: Number, required: true, default: 22 },
    baseWithoutVat: { type: Number, required: true, default: 0 },
    perItemDiscountAmount: { type: Number, required: true, default: 0 },
    globalDiscountAmount: { type: Number, required: true, default: 0 },
    baseAfterDiscount: { type: Number, required: true, default: 0 },
    vatAmount: { type: Number, required: true, default: 0 },
    totalWithVat: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, default: 'draft' as OfferStatus },
  },
  { timestamps: true }
);

OfferVersionSchema.index({ projectId: 1, baseTitle: 1, versionNumber: 1 }, { unique: true });

export const OfferVersionModel: Model<OfferVersionDocument> =
  (mongoose.models.OfferVersion as Model<OfferVersionDocument>) ||
  mongoose.model<OfferVersionDocument>('OfferVersion', OfferVersionSchema);

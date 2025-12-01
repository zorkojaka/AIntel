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
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true, default: 'kos' },
    unitPrice: { type: Number, required: true, min: 0 },
    vatRate: { type: Number, required: true, min: 0, max: 100 },
    totalNet: { type: Number, required: true, min: 0 },
    totalVat: { type: Number, required: true, min: 0 },
    totalGross: { type: Number, required: true, min: 0 },
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
    validUntil: { type: Date, default: null },
    paymentTerms: { type: String, default: null },
    introText: { type: String, default: null },
    items: { type: [OfferLineItemSchema], default: [] },
    totalNet: { type: Number, required: true, default: 0 },
    totalVat22: { type: Number, required: true, default: 0 },
    totalVat95: { type: Number, required: true, default: 0 },
    totalVat: { type: Number, required: true, default: 0 },
    totalGross: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, default: 'draft' as OfferStatus },
  },
  { timestamps: true }
);

OfferVersionSchema.index({ projectId: 1, baseTitle: 1, versionNumber: 1 }, { unique: true });

export const OfferVersionModel: Model<OfferVersionDocument> =
  (mongoose.models.OfferVersion as Model<OfferVersionDocument>) ||
  mongoose.model<OfferVersionDocument>('OfferVersion', OfferVersionSchema);

import mongoose, { Document, Model, Schema } from 'mongoose';
import type { OfferLineItem, OfferTemplate as OfferTemplateType } from '../../../../shared/types/offers';

export interface OfferTemplateLineItemDocument extends Document, OfferLineItem {
  id: string;
}

const OfferTemplateLineItemSchema = new Schema<OfferTemplateLineItemDocument>(
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

export interface OfferTemplateDocument extends Omit<OfferTemplateType, '_id' | 'createdAt' | 'updatedAt'>, Document {}

const OfferTemplateSchema = new Schema<OfferTemplateDocument>(
  {
    title: { type: String, required: true, trim: true },
    sourceProjectId: { type: String, default: null, index: true },
    // Kept as optional legacy metadata for already-saved project-scoped records.
    projectId: { type: String, default: null, index: true },
    sourceOfferId: { type: String, default: null },
    paymentTerms: { type: String, default: null },
    comment: { type: String, default: null },
    items: { type: [OfferTemplateLineItemSchema], default: [] },
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
    applyGlobalDiscount: { type: Boolean, required: true, default: true },
    applyPerItemDiscount: { type: Boolean, required: true, default: true },
    useGlobalDiscount: { type: Boolean, required: true, default: true },
    usePerItemDiscount: { type: Boolean, required: true, default: false },
    vatMode: { type: Number, required: true, default: 22 },
    baseWithoutVat: { type: Number, required: true, default: 0 },
    perItemDiscountAmount: { type: Number, required: true, default: 0 },
    globalDiscountAmount: { type: Number, required: true, default: 0 },
    baseAfterDiscount: { type: Number, required: true, default: 0 },
    vatAmount: { type: Number, required: true, default: 0 },
    totalWithVat: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

OfferTemplateSchema.index({ title: 1 });

export const OfferTemplateModel: Model<OfferTemplateDocument> =
  (mongoose.models.OfferTemplate as Model<OfferTemplateDocument>) ||
  mongoose.model<OfferTemplateDocument>('OfferTemplate', OfferTemplateSchema);

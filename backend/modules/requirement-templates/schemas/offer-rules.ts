import mongoose, { Document, Schema } from 'mongoose';
import type { OfferGenerationRule } from '../../shared/requirements.types';

export interface OfferGenerationRuleDocument extends Omit<OfferGenerationRule, 'id'>, Document {
  id: string;
}

const OfferGenerationRuleSchema = new Schema<OfferGenerationRuleDocument>(
  {
    categorySlug: { type: String, required: true, trim: true },
    variantSlug: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    targetProductCategorySlug: { type: String, required: true, trim: true },
    conditionExpression: { type: String, required: false, trim: true },
    quantityExpression: { type: String, required: true, trim: true },
    productSelectionMode: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

OfferGenerationRuleSchema.index({ categorySlug: 1, variantSlug: 1 });

export const OfferGenerationRuleModel =
  (mongoose.models.OfferGenerationRule as mongoose.Model<OfferGenerationRuleDocument>) ||
  mongoose.model<OfferGenerationRuleDocument>('OfferGenerationRule', OfferGenerationRuleSchema);

import mongoose, { Document, Schema } from 'mongoose';
import type {
  RequirementFieldType,
  RequirementFormulaConfig,
  RequirementTemplateGroup,
  RequirementTemplateRow,
} from '../../shared/requirements.types';

export interface RequirementTemplateGroupDocument
  extends Omit<RequirementTemplateGroup, 'id'>,
    Document {
  id: string;
}

const RequirementFormulaConfigSchema = new Schema<RequirementFormulaConfig>(
  {
    baseFieldId: { type: String, required: true },
    multiplyBy: { type: Number, required: false },
    notes: { type: String, required: false },
  },
  { _id: false }
);

const RequirementTemplateRowSchema = new Schema<RequirementTemplateRow>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    fieldType: { type: String, required: true },
    options: [{ type: String }],
    defaultValue: { type: String },
    helpText: { type: String },
    productCategorySlug: { type: String },
    formulaConfig: { type: RequirementFormulaConfigSchema, required: false },
  },
  { _id: false }
);

const RequirementTemplateGroupSchema = new Schema<RequirementTemplateGroupDocument>(
  {
    categorySlug: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    variantSlug: { type: String, required: true, trim: true },
    rows: { type: [RequirementTemplateRowSchema], default: [] },
  },
  { timestamps: true }
);

RequirementTemplateGroupSchema.index({ categorySlug: 1 });
RequirementTemplateGroupSchema.index({ categorySlug: 1, variantSlug: 1 });

export const RequirementTemplateGroupModel =
  (mongoose.models.RequirementTemplateGroup as mongoose.Model<RequirementTemplateGroupDocument>) ||
  mongoose.model<RequirementTemplateGroupDocument>('RequirementTemplateGroup', RequirementTemplateGroupSchema);

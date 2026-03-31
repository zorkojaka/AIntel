import mongoose, { Document, Model, Schema } from 'mongoose';

export type ProductImportConflictResolutionAction = 'link_existing' | 'create_new' | 'skip';

export interface ProductImportConflictResolutionDocument extends Document {
  source: string;
  externalId: string;
  externalKey: string;
  rowFingerprint: string;
  action: ProductImportConflictResolutionAction;
  targetProductId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductImportConflictResolutionSchema = new Schema<ProductImportConflictResolutionDocument>(
  {
    source: { type: String, required: true, trim: true },
    externalId: { type: String, required: true, trim: true },
    externalKey: { type: String, required: true, trim: true },
    rowFingerprint: { type: String, required: true, trim: true },
    action: {
      type: String,
      required: true,
      enum: ['link_existing', 'create_new', 'skip'],
    },
    targetProductId: { type: Schema.Types.ObjectId, ref: 'Product', default: undefined },
  },
  {
    timestamps: true,
  },
);

ProductImportConflictResolutionSchema.index({ source: 1, externalKey: 1 }, { unique: true });

export const ProductImportConflictResolutionModel: Model<ProductImportConflictResolutionDocument> =
  (mongoose.models.ProductImportConflictResolution as Model<ProductImportConflictResolutionDocument>) ||
  mongoose.model<ProductImportConflictResolutionDocument>(
    'ProductImportConflictResolution',
    ProductImportConflictResolutionSchema,
  );

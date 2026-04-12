import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ProductServiceLinkDocument extends Document {
  productId: mongoose.Types.ObjectId;
  serviceProductId: mongoose.Types.ObjectId;
  quantityMode: 'same_as_product' | 'fixed';
  fixedQuantity?: number;
  isDefault: boolean;
  sortOrder?: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductServiceLinkSchema = new Schema<ProductServiceLinkDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    serviceProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    quantityMode: {
      type: String,
      enum: ['same_as_product', 'fixed'],
      required: true,
      default: 'same_as_product',
    },
    fixedQuantity: { type: Number, min: 0, default: undefined },
    isDefault: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    note: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
  },
);

ProductServiceLinkSchema.index({ productId: 1, sortOrder: 1, createdAt: 1 });

export const ProductServiceLinkModel: Model<ProductServiceLinkDocument> =
  (mongoose.models.ProductServiceLink as Model<ProductServiceLinkDocument>) ||
  mongoose.model<ProductServiceLinkDocument>('ProductServiceLink', ProductServiceLinkSchema);

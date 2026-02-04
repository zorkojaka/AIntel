import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ProductDocument extends Document {
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
  ime: string;
  kategorija?: string;
  categorySlugs: string[];
  categorySlug?: string;
  categories?: string[];
  purchasePriceWithoutVat: number;
  nabavnaCena: number;
  prodajnaCena: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  proizvajalec?: string;
  dobavitelj?: string;
  povezavaDoProdukta?: string;
  naslovDobavitelja?: string;
  casovnaNorma?: string;
  isService: boolean;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<ProductDocument>(
  {
    externalSource: { type: String, trim: true, default: '' },
    externalId: { type: String, trim: true, default: '' },
    externalKey: { type: String, trim: true, unique: true, sparse: true },
    ime: { type: String, required: true, trim: true },
    kategorija: { type: String, trim: true, default: '' },
    categorySlugs: { type: [String], default: [] },
    categorySlug: { type: String, trim: true, lowercase: true },
    categories: { type: [String], default: [] },
    purchasePriceWithoutVat: { type: Number, required: true, min: 0, default: 0 },
    nabavnaCena: { type: Number, required: true, min: 0, default: 0 },
    prodajnaCena: { type: Number, required: true, min: 0, default: 0 },
    kratekOpis: { type: String, trim: true, default: '' },
    dolgOpis: { type: String, trim: true, default: '' },
    povezavaDoSlike: { type: String, trim: true, default: '' },
    proizvajalec: { type: String, trim: true, default: '' },
    dobavitelj: { type: String, trim: true, default: '' },
    povezavaDoProdukta: { type: String, trim: true, default: '' },
    naslovDobavitelja: { type: String, trim: true, default: '' },
    casovnaNorma: { type: String, trim: true, default: '' },
    isService: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: true
  }
);

ProductSchema.index({ externalKey: 1 }, { unique: true, sparse: true });
ProductSchema.index(
  { externalSource: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalSource: 'aa_api',
      externalId: { $type: 'string', $ne: '' }
    }
  }
);

export const ProductModel: Model<ProductDocument> =
  (mongoose.models.Product as Model<ProductDocument>) || mongoose.model<ProductDocument>('Product', ProductSchema);

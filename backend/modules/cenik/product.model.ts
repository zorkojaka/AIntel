import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ProductDocument extends Document {
  ime: string;
  kategorija: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<ProductDocument>(
  {
    ime: { type: String, required: true, trim: true },
    kategorija: { type: String, required: true, trim: true },
    nabavnaCena: { type: Number, required: true, min: 0, default: 0 },
    prodajnaCena: { type: Number, required: true, min: 0, default: 0 },
    kratekOpis: { type: String, trim: true, default: '' },
    dolgOpis: { type: String, trim: true, default: '' },
    povezavaDoSlike: { type: String, trim: true, default: '' },
    proizvajalec: { type: String, trim: true, default: '' },
    dobavitelj: { type: String, trim: true, default: '' },
    povezavaDoProdukta: { type: String, trim: true, default: '' },
    naslovDobavitelja: { type: String, trim: true, default: '' },
    casovnaNorma: { type: String, trim: true, default: '' }
  },
  {
    timestamps: true
  }
);

export const ProductModel: Model<ProductDocument> =
  (mongoose.models.Product as Model<ProductDocument>) || mongoose.model<ProductDocument>('Product', ProductSchema);

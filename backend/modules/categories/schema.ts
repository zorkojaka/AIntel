import mongoose, { Document, Schema } from 'mongoose';

export interface CategoryDocument extends Document {
  name: string;
  slug: string;
  color?: string;
  order?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<CategoryDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    color: { type: String, trim: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const CategoryModel =
  (mongoose.models.Category as mongoose.Model<CategoryDocument>) ||
  mongoose.model<CategoryDocument>('Category', CategorySchema);

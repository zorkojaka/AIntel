import mongoose, { Document, Model, Schema } from 'mongoose';

export type CategorySettingsSource = 'aa_api';
export type CategorySettingsLevel = 1 | 2;
export type CategorySettingsPriority = 1 | 2 | 3 | null;

export interface CategorySettingsDocument extends Document {
  path: string;
  topLevel: string;
  subLevel?: string | null;
  level: CategorySettingsLevel;
  isActive: boolean;
  priority: CategorySettingsPriority;
  productCountInApi: number;
  productCountActive: number;
  lastSyncedAt?: Date | null;
  notes: string;
  source: CategorySettingsSource;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySettingsSchema = new Schema<CategorySettingsDocument>(
  {
    path: { type: String, required: true, trim: true, unique: true },
    topLevel: { type: String, required: true, trim: true },
    subLevel: { type: String, trim: true, default: null },
    level: { type: Number, required: true, enum: [1, 2] },
    isActive: { type: Boolean, required: true, default: false },
    priority: { type: Number, enum: [1, 2, 3, null], default: null },
    productCountInApi: { type: Number, required: true, min: 0, default: 0 },
    productCountActive: { type: Number, required: true, min: 0, default: 0 },
    lastSyncedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },
    source: { type: String, required: true, enum: ['aa_api'], default: 'aa_api' },
  },
  {
    collection: 'category_settings',
    timestamps: true,
  },
);

CategorySettingsSchema.index({ path: 1 }, { unique: true });
CategorySettingsSchema.index({ topLevel: 1, subLevel: 1 });
CategorySettingsSchema.index({ isActive: 1, priority: 1 });
CategorySettingsSchema.index({ source: 1, isActive: 1 });

export const CategorySettingsModel: Model<CategorySettingsDocument> =
  (mongoose.models.CategorySettings as Model<CategorySettingsDocument>) ||
  mongoose.model<CategorySettingsDocument>('CategorySettings', CategorySettingsSchema);

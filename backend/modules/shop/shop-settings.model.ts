import { Schema, model, type Document } from 'mongoose';

export interface ShopSyncState {
  status: 'idle' | 'running' | 'done' | 'failed';
  startedAt?: Date;
  finishedAt?: Date;
  total?: number;
  processed?: number;
  created?: number;
  updated?: number;
  archived?: number;
  errors?: string[];
  message?: string;
}

export interface ShopSettingsDocument extends Document {
  key: string;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  lastSync?: ShopSyncState;
}

const shopSyncStateSchema = new Schema(
  {
    status: { type: String, enum: ['idle', 'running', 'done', 'failed'], default: 'idle' },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    total: { type: Number },
    processed: { type: Number },
    created: { type: Number },
    updated: { type: Number },
    archived: { type: Number },
    errors: { type: [String], default: [] },
    message: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const shopSettingsSchema = new Schema<ShopSettingsDocument>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    baseUrl: { type: String, required: true, trim: true },
    consumerKey: { type: String, required: true, trim: true },
    consumerSecret: { type: String, required: true, trim: true },
    lastSync: { type: shopSyncStateSchema, required: false, default: undefined },
  },
  { timestamps: true, collection: 'shop_settings' },
);

export const ShopSettingsModel = model<ShopSettingsDocument>('ShopSettings', shopSettingsSchema);

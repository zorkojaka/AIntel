import { Schema, model, type Document } from 'mongoose';

export interface SupplierEmailEntry {
  address: string;
  isDefault: boolean;
}

export interface SupplierSettingsDocument extends Document {
  key: string;
  name: string;
  emails: SupplierEmailEntry[];
}

const supplierEmailSchema = new Schema(
  {
    address: { type: String, required: true, trim: true, lowercase: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

const supplierSettingsSchema = new Schema<SupplierSettingsDocument>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    emails: { type: [supplierEmailSchema], default: [] },
  },
  { timestamps: true, collection: 'supplier_settings' },
);

export const SupplierSettingsModel = model<SupplierSettingsDocument>('SupplierSettings', supplierSettingsSchema);

import { Schema, model, Document } from 'mongoose';

export interface DocumentPrefix {
  offer: string;
  invoice: string;
  order: string;
  deliveryNote: string;
  workOrder: string;
}

export interface Settings {
  companyName: string;
  address: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  documentPrefix: DocumentPrefix;
  defaultPaymentTerms?: string;
  disclaimer?: string;
}

export interface SettingsDocument extends Document, Settings {
  key: string;
}

const DocumentPrefixSchema = new Schema<DocumentPrefix>(
  {
    offer: { type: String, default: 'PON-' },
    invoice: { type: String, default: 'RAC-' },
    order: { type: String, default: 'NOR-' },
    deliveryNote: { type: String, default: 'DOB-' },
    workOrder: { type: String, default: 'DEL-' }
  },
  { _id: false }
);

const SettingsSchema = new Schema<SettingsDocument>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    companyName: { type: String, required: true, default: '' },
    address: { type: String, required: true, default: '' },
    email: { type: String },
    phone: { type: String },
    logoUrl: { type: String },
    primaryColor: { type: String, default: '#0f62fe' },
    documentPrefix: { type: DocumentPrefixSchema, default: {} },
    defaultPaymentTerms: { type: String },
    disclaimer: { type: String }
  },
  {
    timestamps: true,
    minimize: false
  }
);

export const SettingsModel = model<SettingsDocument>('Settings', SettingsSchema);

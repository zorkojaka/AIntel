import { Document, model, Schema } from 'mongoose';

export type CrmClientType = 'company' | 'individual';

export interface CrmClient extends Document {
  name: string;
  type: CrmClientType;
  vat_number?: string;
  address?: string;
  email?: string;
  phone?: string;
  contact_person?: string;
  street?: string;
  postalCode?: string;
  postalCity?: string;
  tags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isComplete?: boolean;
}

const CrmClientSchema = new Schema<CrmClient>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['company', 'individual'] },
    vat_number: { type: String, trim: true },
    street: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    postalCity: { type: String, trim: true },
    address: { type: String },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String },
    contact_person: { type: String },
    tags: { type: [String], default: [] },
    notes: { type: String }
  },
  { timestamps: true }
);

export const CrmClientModel = model<CrmClient>('CrmClient', CrmClientSchema);

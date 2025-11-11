import { Schema, model, Document, Types } from 'mongoose';

export interface CrmCompany extends Document {
  name: string;
  vat_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  persons: Types.ObjectId[];
  notes: Types.ObjectId[];
}

const CrmCompanySchema = new Schema<CrmCompany>(
  {
    name: { type: String, required: true },
    vat_id: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    persons: [{ type: Schema.Types.ObjectId, ref: 'CrmPerson' }],
    notes: [{ type: Schema.Types.ObjectId, ref: 'CrmNote' }]
  },
  { timestamps: true }
);

export const CrmCompanyModel = model<CrmCompany>('CrmCompany', CrmCompanySchema);

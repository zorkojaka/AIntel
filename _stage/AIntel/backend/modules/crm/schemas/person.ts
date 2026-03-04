import { Schema, model, Document, Types } from 'mongoose';

export interface CrmPerson extends Document {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  company_id?: Types.ObjectId;
  project_ids: Types.ObjectId[];
  notes: Types.ObjectId[];
}

const CrmPersonSchema = new Schema<CrmPerson>(
  {
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    company_id: { type: Schema.Types.ObjectId, ref: 'CrmCompany' },
    project_ids: [{ type: Schema.Types.ObjectId }],
    notes: [{ type: Schema.Types.ObjectId, ref: 'CrmNote' }]
  },
  { timestamps: true }
);

export const CrmPersonModel = model<CrmPerson>('CrmPerson', CrmPersonSchema);

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface EmployeeDocument extends Document {
  tenantId: string;
  name: string;
  company?: string;
  hourRateWithoutVat: number;
  active: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<EmployeeDocument>(
  {
    tenantId: { type: String, required: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true, default: '' },
    hourRateWithoutVat: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, required: true, default: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

EmployeeSchema.index({ tenantId: 1, name: 1 });

export const EmployeeModel: Model<EmployeeDocument> =
  (mongoose.models.Employee as Model<EmployeeDocument>) ||
  mongoose.model<EmployeeDocument>('Employee', EmployeeSchema);

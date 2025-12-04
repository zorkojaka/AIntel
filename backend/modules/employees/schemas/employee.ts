import mongoose, { Document, Model, Schema } from 'mongoose';

export interface EmployeeDocument extends Document {
  name: string;
  company?: string;
  hourRateWithoutVat: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<EmployeeDocument>(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true, default: '' },
    hourRateWithoutVat: { type: Number, required: true, default: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

export const EmployeeModel: Model<EmployeeDocument> =
  (mongoose.models.Employee as Model<EmployeeDocument>) ||
  mongoose.model<EmployeeDocument>('Employee', EmployeeSchema);

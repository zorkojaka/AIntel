import mongoose, { Document, Model, Schema } from 'mongoose';

export interface EmployeeDocument extends Document {
  tenantId: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  roles?: string[];
  address?: string;
  employmentStartDate?: Date | null;
  contractType?: string | null;
  shirtSize?: string | null;
  shoeSize?: number | null;
  notes?: string;
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
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    roles: {
      type: [String],
      enum: ['ADMIN', 'SALES', 'EXECUTION', 'FINANCE'],
      default: [],
    },
    address: { type: String, trim: true, default: '' },
    employmentStartDate: { type: Date, default: null },
    contractType: { type: String, trim: true, default: null },
    shirtSize: { type: String, trim: true, default: null },
    shoeSize: { type: Number, default: null },
    notes: { type: String, trim: true, default: '' },
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

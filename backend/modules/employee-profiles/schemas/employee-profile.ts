import mongoose, { Document, Model, Schema } from 'mongoose';

export interface EmployeeProfileDocument extends Document {
  tenantId: string;
  employeeId: mongoose.Types.ObjectId;
  primaryRole: string;
  profitSharePercent: number;
  hourlyRate?: number | null;
  exceptions: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeProfileSchema = new Schema<EmployeeProfileDocument>(
  {
    tenantId: { type: String, required: true, index: true, trim: true },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'Employee' },
    primaryRole: { type: String, required: true, trim: true },
    profitSharePercent: { type: Number, required: true, min: 0, max: 100 },
    hourlyRate: { type: Number, default: null },
    exceptions: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

EmployeeProfileSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });

export const EmployeeProfileModel: Model<EmployeeProfileDocument> =
  (mongoose.models.EmployeeProfile as Model<EmployeeProfileDocument>) ||
  mongoose.model<EmployeeProfileDocument>('EmployeeProfile', EmployeeProfileSchema);

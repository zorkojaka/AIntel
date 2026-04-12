import mongoose, { Document, Model, Schema } from 'mongoose';

export interface EmployeeServiceRateDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  serviceProductId: mongoose.Types.ObjectId;
  defaultPercent: number;
  overridePrice: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeServiceRateSchema = new Schema<EmployeeServiceRateDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    serviceProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    defaultPercent: { type: Number, required: true, min: 0, max: 100 },
    overridePrice: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

EmployeeServiceRateSchema.index({ employeeId: 1, serviceProductId: 1 }, { unique: true });

export const EmployeeServiceRateModel: Model<EmployeeServiceRateDocument> =
  (mongoose.models.EmployeeServiceRate as Model<EmployeeServiceRateDocument>) ||
  mongoose.model<EmployeeServiceRateDocument>('EmployeeServiceRate', EmployeeServiceRateSchema);

import mongoose, { Document, Model, Schema } from 'mongoose';

/**
 * Urnik razpoložljivosti monterja (za termine montaž):
 * - self:  monter sam klika proste dneve na koledarju; dayStart/EndHour sta
 *          njegova privzeta delavnika ob kliku na dan;
 * - fixed: admin vnese tedenski delavnik (fixedWeeklyHours), dnevi se
 *          označijo samodejno, izjeme monter/admin uredi po dnevih.
 * hours = cele ure začetkov (8 pomeni 8:00–9:00).
 */
export interface EmployeeScheduleSettings {
  mode: 'self' | 'fixed';
  dayStartHour: number;
  dayEndHour: number;
  /** Ključi 0–6 kot pri Date.getDay(): 0=nedelja, 1=ponedeljek … 6=sobota. */
  fixedWeeklyHours?: Record<string, number[]>;
}

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
  schedule?: EmployeeScheduleSettings | null;
  active: boolean;
  appAccess: boolean;
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
      enum: ['ADMIN', 'SALES', 'EXECUTION', 'FINANCE', 'ORGANIZER'],
      default: [],
    },
    address: { type: String, trim: true, default: '' },
    employmentStartDate: { type: Date, default: null },
    contractType: { type: String, trim: true, default: null },
    shirtSize: { type: String, trim: true, default: null },
    shoeSize: { type: Number, default: null },
    notes: { type: String, trim: true, default: '' },
    hourRateWithoutVat: { type: Number, required: true, default: 0, min: 0 },
    schedule: {
      type: new Schema<EmployeeScheduleSettings>(
        {
          mode: { type: String, enum: ['self', 'fixed'], required: true, default: 'self' },
          dayStartHour: { type: Number, required: true, min: 0, max: 23, default: 8 },
          dayEndHour: { type: Number, required: true, min: 1, max: 24, default: 16 },
          fixedWeeklyHours: { type: Schema.Types.Mixed, default: undefined },
        },
        { _id: false }
      ),
      default: null,
    },
    active: { type: Boolean, required: true, default: true },
    appAccess: { type: Boolean, required: true, default: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

EmployeeSchema.index({ tenantId: 1, name: 1 });

export const EmployeeModel: Model<EmployeeDocument> =
  (mongoose.models.Employee as Model<EmployeeDocument>) ||
  mongoose.model<EmployeeDocument>('Employee', EmployeeSchema);

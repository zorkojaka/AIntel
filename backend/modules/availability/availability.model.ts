import mongoose, { Document, Model, Schema } from 'mongoose';

// Razpoložljivost monterja po dnevih. En zapis = en dan enega monterja.
// Za monterje s fiksnim urnikom zapis pomeni IZJEMO (prepiše tedenski vzorec);
// za monterje, ki si urnik klikajo sami, je zapis edini vir razpoložljivosti.

export interface EmployeeAvailabilityDayDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  /** Dan v obliki YYYY-MM-DD (lokalni koledarski dan, brez časovnih pasov). */
  date: string;
  /** Cele ure začetkov, ko je monter na voljo (8 = 8:00–9:00). Prazno = ni na voljo. */
  hours: number[];
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeAvailabilityDaySchema = new Schema<EmployeeAvailabilityDayDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hours: { type: [Number], required: true, default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'employee_availability_days' }
);

EmployeeAvailabilityDaySchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const EmployeeAvailabilityDayModel: Model<EmployeeAvailabilityDayDocument> =
  (mongoose.models.EmployeeAvailabilityDay as Model<EmployeeAvailabilityDayDocument>) ||
  mongoose.model<EmployeeAvailabilityDayDocument>('EmployeeAvailabilityDay', EmployeeAvailabilityDaySchema);

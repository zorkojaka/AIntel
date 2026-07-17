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

// Tedenska omejitev števila delovnih dni: monter lahko označi več prostih dni,
// kot jih dejansko želi delati — ko je v tednu zasedenih toliko dni, kolikor
// dovoli omejitev, se preostali prosti dnevi tistega tedna ne ponujajo več.
// Zapis je IZJEMA za konkreten teden; privzeta vrednost je v schedule
// (maxWorkdaysPerWeek na zaposlenem).

export interface EmployeeWeekLimitDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  /** Ponedeljek tedna v obliki YYYY-MM-DD. */
  weekStart: string;
  /** Največ delovnih dni v tem tednu (0 = ta teden ne delam). */
  maxWorkdays: number;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeWeekLimitSchema = new Schema<EmployeeWeekLimitDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, required: true },
    weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    maxWorkdays: { type: Number, required: true, min: 0, max: 7 },
  },
  { timestamps: true, versionKey: false, collection: 'employee_week_limits' }
);

EmployeeWeekLimitSchema.index({ employeeId: 1, weekStart: 1 }, { unique: true });

export const EmployeeWeekLimitModel: Model<EmployeeWeekLimitDocument> =
  (mongoose.models.EmployeeWeekLimit as Model<EmployeeWeekLimitDocument>) ||
  mongoose.model<EmployeeWeekLimitDocument>('EmployeeWeekLimit', EmployeeWeekLimitSchema);

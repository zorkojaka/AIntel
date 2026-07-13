import mongoose, { Document, Model, Schema } from 'mongoose';

// AIN-P2-08 rez 2: MaintenancePlan (TARGET §8). Nastane iz potrjenih postavk
// ponudbe (oprema, ki je vgrajena). Kolo pravilo maintenance.due letno ustvari
// opravilo »preventivni pregled« z upsell checklistom; garancija izhaja iz
// zaključka izvedbe. E-mail stranki se pošlje ROČNO iz opravila (Jakov princip:
// stranki nikoli samodejno).

export const MAINTENANCE_PLAN_STATUSES = ['active', 'paused', 'ended'] as const;
export type MaintenancePlanStatus = (typeof MAINTENANCE_PLAN_STATUSES)[number];

export interface MaintenancePlanEquipment {
  productId?: mongoose.Types.ObjectId;
  name: string;
  quantity: number;
}

export interface MaintenancePlanHistoryEntry {
  at: Date;
  byUserId?: mongoose.Types.ObjectId;
  action: string; // created | generated | visit_recorded | paused | resumed | ended | rescheduled | updated
  note?: string;
}

export interface MaintenancePlanDocument extends Document {
  tenantId: string;
  status: MaintenancePlanStatus;
  client: { id?: mongoose.Types.ObjectId; name?: string; email?: string };
  projectId?: string; // človeški ID projekta (PRJ-###)
  projectMongoId?: mongoose.Types.ObjectId;
  offerVersionId?: mongoose.Types.ObjectId;
  equipment: MaintenancePlanEquipment[];
  intervalMonths: number;
  installedAt?: Date;
  warrantyUntil?: Date;
  nextDueAt: Date;
  lastVisitAt?: Date;
  upsellChecklist: string[];
  createdBy: { kind: 'user' | 'system'; userId?: mongoose.Types.ObjectId };
  history: MaintenancePlanHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const MaintenancePlanSchema = new Schema<MaintenancePlanDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent', index: true },
    status: { type: String, enum: MAINTENANCE_PLAN_STATUSES, required: true, default: 'active' },
    client: {
      id: { type: Schema.Types.ObjectId, default: undefined },
      name: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, lowercase: true, default: '' },
    },
    projectId: { type: String, trim: true, default: undefined },
    projectMongoId: { type: Schema.Types.ObjectId, default: undefined },
    offerVersionId: { type: Schema.Types.ObjectId, default: undefined },
    equipment: [
      {
        productId: { type: Schema.Types.ObjectId, default: undefined },
        name: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 0, default: 1 },
        _id: false,
      },
    ],
    intervalMonths: { type: Number, required: true, default: 12, min: 1, max: 120 },
    installedAt: { type: Date, default: undefined },
    warrantyUntil: { type: Date, default: undefined },
    nextDueAt: { type: Date, required: true },
    lastVisitAt: { type: Date, default: undefined },
    upsellChecklist: { type: [String], default: [] },
    createdBy: {
      kind: { type: String, enum: ['user', 'system'], required: true, default: 'user' },
      userId: { type: Schema.Types.ObjectId, default: undefined },
    },
    history: [
      {
        at: { type: Date, required: true },
        byUserId: { type: Schema.Types.ObjectId, default: undefined },
        action: { type: String, required: true },
        note: { type: String, trim: true, default: undefined },
        _id: false,
      },
    ],
  },
  { timestamps: true, versionKey: false, collection: 'maintenance_plans' },
);

MaintenancePlanSchema.index({ tenantId: 1, status: 1, nextDueAt: 1 });
MaintenancePlanSchema.index({ tenantId: 1, 'client.id': 1 });
// En načrt na projekt (idempotenten from-project); velja le kjer je projectId niz.
MaintenancePlanSchema.index(
  { tenantId: 1, projectId: 1 },
  { unique: true, partialFilterExpression: { projectId: { $type: 'string' } } },
);

export const MaintenancePlanModel: Model<MaintenancePlanDocument> =
  (mongoose.models.MaintenancePlan as Model<MaintenancePlanDocument>) ||
  mongoose.model<MaintenancePlanDocument>('MaintenancePlan', MaintenancePlanSchema);

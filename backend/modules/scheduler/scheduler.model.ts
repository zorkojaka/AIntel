import mongoose, { Document, Model, Schema } from 'mongoose';

export type SchedulerRunOutcome = 'success' | 'error';

export interface SchedulerLockDocument extends Document {
  _id: string;
  ownerId: string;
  leaseUntil: Date;
  lastAcquiredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchedulerRunDocument extends Document {
  key: string;
  ownerId: string;
  startedAt: Date;
  finishedAt?: Date;
  outcome?: SchedulerRunOutcome;
  counts?: Record<string, number>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SchedulerLockSchema = new Schema<SchedulerLockDocument>(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, trim: true },
    leaseUntil: { type: Date, required: true },
    lastAcquiredAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const SchedulerRunSchema = new Schema<SchedulerRunDocument>(
  {
    key: { type: String, required: true, trim: true },
    ownerId: { type: String, required: true, trim: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: undefined },
    outcome: { type: String, enum: ['success', 'error'], default: undefined },
    counts: { type: Schema.Types.Mixed, default: undefined },
    error: { type: String, trim: true, default: undefined },
  },
  { timestamps: true },
);

// Declared here AND picked up by scripts/ensure-indexes.ts (autoIndex is off).
SchedulerLockSchema.index({ leaseUntil: 1 });
SchedulerRunSchema.index({ key: 1, startedAt: -1 });
SchedulerRunSchema.index({ outcome: 1, startedAt: -1 });

export const SchedulerLockModel: Model<SchedulerLockDocument> =
  (mongoose.models.SchedulerLock as Model<SchedulerLockDocument>) ||
  mongoose.model<SchedulerLockDocument>('SchedulerLock', SchedulerLockSchema as any, 'scheduler_locks');

export const SchedulerRunModel: Model<SchedulerRunDocument> =
  (mongoose.models.SchedulerRun as Model<SchedulerRunDocument>) ||
  mongoose.model<SchedulerRunDocument>('SchedulerRun', SchedulerRunSchema as any, 'scheduler_runs');

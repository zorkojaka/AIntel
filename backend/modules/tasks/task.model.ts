import mongoose, { Document, Model, Schema } from 'mongoose';

// AIN-P1-09: Task — the hub entity of the wheel (AINTEL_WHEEL_SPEC.md §2).
// Manual tasks first; automation rules (source.kind='rule') come with AIN-P1-11.

export const TASK_SUBJECT_KINDS = [
  'project',
  'inquiry',
  'client',
  'offerVersion',
  'workOrder',
  'materialOrder',
  'invoice',
  'serviceTicket',
  'none',
] as const;
export type TaskSubjectKind = (typeof TASK_SUBJECT_KINDS)[number];

export const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskHistoryEntry {
  at: Date;
  byUserId?: mongoose.Types.ObjectId;
  action: string; // created | claimed | completed | blocked | unblocked | reassigned | rescheduled | cancelled | reopened | updated
  note?: string;
}

export interface TaskDocument extends Document {
  tenantId: string;
  type: string;
  title: string;
  description?: string;
  subject: {
    kind: TaskSubjectKind;
    id?: mongoose.Types.ObjectId;
    label?: string;
  };
  assigneeEmployeeId?: mongoose.Types.ObjectId;
  assigneeRole?: string;
  status: TaskStatus;
  blockedReason?: string;
  priority: TaskPriority;
  dueAt?: Date;
  slaBreachedAt?: Date;
  source: { kind: 'user' | 'rule'; ruleKey?: string; userId?: mongoose.Types.ObjectId };
  dedupeKey?: string;
  // resolvedBy = user (manual completion); resolvedByRule = rule key (AIN-P1-11
  // rules resolve tasks too, e.g. offer accepted → follow-up auto-completes).
  resolution?: { outcome: string; note?: string; resolvedBy?: mongoose.Types.ObjectId; resolvedByRule?: string; resolvedAt: Date };
  history: TaskHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<TaskDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent' },
    type: { type: String, required: true, trim: true, default: 'manual' },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    subject: {
      type: {
        kind: { type: String, enum: TASK_SUBJECT_KINDS, required: true, default: 'none' },
        id: { type: Schema.Types.ObjectId, default: undefined },
        label: { type: String, trim: true, default: '' },
      },
      _id: false,
      required: true,
      default: () => ({ kind: 'none' }),
    },
    assigneeEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: undefined },
    assigneeRole: { type: String, trim: true, default: undefined },
    status: { type: String, enum: TASK_STATUSES, required: true, default: 'open' },
    blockedReason: { type: String, trim: true, default: undefined },
    priority: { type: String, enum: TASK_PRIORITIES, required: true, default: 'normal' },
    dueAt: { type: Date, default: undefined },
    slaBreachedAt: { type: Date, default: undefined },
    source: {
      type: {
        kind: { type: String, enum: ['user', 'rule'], required: true, default: 'user' },
        ruleKey: { type: String, trim: true, default: undefined },
        userId: { type: Schema.Types.ObjectId, default: undefined },
      },
      _id: false,
      required: true,
      default: () => ({ kind: 'user' }),
    },
    dedupeKey: { type: String, trim: true, default: undefined },
    resolution: {
      type: {
        outcome: { type: String, required: true, trim: true },
        note: { type: String, trim: true, default: '' },
        resolvedBy: { type: Schema.Types.ObjectId, default: undefined },
        resolvedByRule: { type: String, trim: true, default: undefined },
        resolvedAt: { type: Date, required: true },
      },
      _id: false,
      required: false,
      default: undefined,
    },
    history: {
      type: [
        {
          at: { type: Date, required: true },
          byUserId: { type: Schema.Types.ObjectId, default: undefined },
          action: { type: String, required: true, trim: true },
          note: { type: String, trim: true, default: undefined },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// Declared here AND in scripts/ensure-indexes.ts (autoIndex is off — AIN-P1-05).
TaskSchema.index({ tenantId: 1, status: 1, assigneeRole: 1, dueAt: 1 });
TaskSchema.index({ tenantId: 1, assigneeEmployeeId: 1, status: 1 });
TaskSchema.index({ 'subject.kind': 1, 'subject.id': 1 });
TaskSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export const TaskModel: Model<TaskDocument> =
  mongoose.models.Task || mongoose.model<TaskDocument>('Task', TaskSchema);

import { Schema, Types } from 'mongoose';

export const TIMELINE_PHASES = ['offer', 'order', 'workOrder', 'deliveryNote', 'invoice'] as const;

export type ProjectPhase = (typeof TIMELINE_PHASES)[number];
export type TimelineStatus = 'pending' | 'completed';

export interface TimelineEvent {
  phase: ProjectPhase;
  status: TimelineStatus;
  documentId?: Types.ObjectId;
  confirmed: boolean;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
}

export const TimelineEventSchema = new Schema<TimelineEvent>(
  {
    phase: { type: String, enum: TIMELINE_PHASES, required: true },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    documentId: { type: Schema.Types.ObjectId },
    confirmed: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId },
    createdAt: { type: Date, default: () => new Date() }
  },
  { _id: false }
);

import { Schema, model, Document, Types } from 'mongoose';
import { TimelineEvent, TimelineEventSchema } from './TimelineEvent';

export type ProjectStatus = 'draft' | 'confirmed' | 'scheduled' | 'executed' | 'completed';

export interface ProjectDocuments {
  offerId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  workOrderId?: Types.ObjectId;
  deliveryNoteId?: Types.ObjectId;
  invoiceId?: Types.ObjectId;
}

export interface ProjectDocument extends Document {
  project_id: number;
  name: string;
  description?: string;
  status: ProjectStatus;
  company_id: Types.ObjectId;
  contact_id: Types.ObjectId;
  city?: string;
  startDate?: Date;
  endDate?: Date;
  notes: string[];
  documents: ProjectDocuments;
  timeline: TimelineEvent[];
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<ProjectDocument>(
  {
    project_id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    status: {
      type: String,
      enum: ['draft', 'confirmed', 'scheduled', 'executed', 'completed'],
      default: 'draft'
    },
    company_id: { type: Schema.Types.ObjectId, ref: 'CrmCompany', required: true },
    contact_id: { type: Schema.Types.ObjectId, ref: 'CrmPerson', required: true },
    city: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    notes: { type: [String], default: [] },
    documents: {
      type: {
        offerId: { type: Schema.Types.ObjectId },
        orderId: { type: Schema.Types.ObjectId },
        workOrderId: { type: Schema.Types.ObjectId },
        deliveryNoteId: { type: Schema.Types.ObjectId },
        invoiceId: { type: Schema.Types.ObjectId }
      },
      default: {}
    },
    timeline: { type: [TimelineEventSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'CrmPerson' }
  },
  { timestamps: true }
);

export const ProjectModel = model<ProjectDocument>('Project', ProjectSchema);

import { Schema, model, Document, Types } from 'mongoose';

export type CrmEntityType = 'person' | 'company';

export interface CrmNote extends Document {
  content: string;
  entity_type: CrmEntityType;
  entity_id: Types.ObjectId;
  created_by?: Types.ObjectId;
  created_at: Date;
}

const CrmNoteSchema = new Schema<CrmNote>(
  {
    content: { type: String, required: true },
    entity_type: { type: String, enum: ['person', 'company'], required: true },
    entity_id: { type: Schema.Types.ObjectId, required: true },
    created_by: { type: Schema.Types.ObjectId },
    created_at: { type: Date, default: () => new Date() }
  },
  { timestamps: true }
);

export const CrmNoteModel = model<CrmNote>('CrmNote', CrmNoteSchema);

import { Schema, model, Document, Types } from 'mongoose';

export type CrmEntityType = 'person' | 'company' | 'client';

export interface CrmNote extends Document {
  content: string;
  entity_type: CrmEntityType;
  entity_id: Types.ObjectId;
  /** Projekt (project.id, npr. "PRJ-178"), na katerem je zapis nastal. Zapis sam ostane na stranki. */
  projectId?: string | null;
  created_by?: Types.ObjectId;
  /** Ime avtorja ob zapisu — posnetek, da zapis ostane berljiv tudi, če uporabnika ni več. */
  created_by_name?: string;
  created_at: Date;
}

const CrmNoteSchema = new Schema<CrmNote>(
  {
    content: { type: String, required: true },
    entity_type: { type: String, enum: ['person', 'company', 'client'], required: true },
    entity_id: { type: Schema.Types.ObjectId, required: true },
    projectId: { type: String, default: null },
    created_by: { type: Schema.Types.ObjectId },
    created_by_name: { type: String, default: '' },
    created_at: { type: Date, default: () => new Date() }
  },
  { timestamps: true }
);

CrmNoteSchema.index({ entity_type: 1, entity_id: 1, created_at: -1 });

export const CrmNoteModel = model<CrmNote>('CrmNote', CrmNoteSchema);

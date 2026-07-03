import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ReviewStatus = 'poslano' | 'oddano' | 'odobreno' | 'skrito';

export interface ReviewDocument extends Document {
  tenantId: string;
  projectId: string;
  clientId?: Types.ObjectId | null;
  name: string; // javno prikazano ime, npr. "Janez N."
  pillar: string;
  token: string;
  status: ReviewStatus;
  rating?: number | null;
  comment?: string | null;
  emailSentAt?: Date | null;
  submittedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<ReviewDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent', index: true },
    projectId: { type: String, required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'CrmClient', default: null },
    name: { type: String, required: true, trim: true },
    pillar: { type: String, trim: true, default: '' },
    token: { type: String, required: true, unique: true },
    status: { type: String, enum: ['poslano', 'oddano', 'odobreno', 'skrito'], default: 'poslano', index: true },
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, trim: true, maxlength: 1000, default: null },
    emailSentAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ReviewModel: Model<ReviewDocument> =
  (mongoose.models.Review as Model<ReviewDocument>) ||
  (mongoose.model('Review', ReviewSchema as any, 'reviews') as Model<ReviewDocument>);

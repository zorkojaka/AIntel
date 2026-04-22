import mongoose, { Schema, Types, type Document } from 'mongoose';

export const PHOTO_PHASES = ['requirements', 'offer', 'preparation', 'execution', 'delivery', 'other'] as const;

export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export interface Photo {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  phase: PhotoPhase;
  itemId?: string;
  unitIndex?: number;
  tag?: string;
  url: string;
  thumbnailUrl?: string;
  originalName: string;
  filename: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  deletedAt?: Date;
}

export interface PhotoDocument extends Omit<Photo, '_id'>, Document {
  _id: Types.ObjectId;
}

const photoSchema = new Schema<PhotoDocument>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    phase: { type: String, enum: PHOTO_PHASES, required: true, index: true },
    itemId: { type: String, trim: true },
    unitIndex: { type: Number, min: 0 },
    tag: { type: String, trim: true },
    url: { type: String, required: true },
    thumbnailUrl: { type: String },
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true, default: 'image/jpeg' },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    uploadedAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: undefined },
  },
  { timestamps: false },
);

photoSchema.index({ projectId: 1, phase: 1 });
photoSchema.index({ projectId: 1, phase: 1, itemId: 1, unitIndex: 1 });

export const PhotoModel =
  (mongoose.models.Photo as mongoose.Model<PhotoDocument>) || mongoose.model<PhotoDocument>('Photo', photoSchema);

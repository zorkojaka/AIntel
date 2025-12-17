import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface DocumentCounterDocument extends Document {
  _id: string;
  value: number;
  updatedAt: Date;
  createdAt: Date;
}

const DocumentCounterSchema = new Schema<DocumentCounterDocument>(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false, collection: 'document_number_counters' }
);

export const DocumentCounterModel: Model<DocumentCounterDocument> =
  (mongoose.models.DocumentCounter as Model<DocumentCounterDocument>) ||
  model<DocumentCounterDocument>('DocumentCounter', DocumentCounterSchema);

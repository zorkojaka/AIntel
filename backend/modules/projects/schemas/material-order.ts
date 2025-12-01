import { Schema, model, type Document } from 'mongoose';

interface MaterialOrderDocument extends Document {
  projectId: string;
  offerVersionId: string;
  items: {
    id: string;
    productId: string | null;
    name: string;
    quantity: number;
    unit: string;
    note?: string;
  }[];
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
}

const materialItemSchema = new Schema(
  {
    id: { type: String, required: true },
    productId: { type: String, default: null },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    note: { type: String },
  },
  { _id: false }
);

const materialOrderSchema = new Schema<MaterialOrderDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerVersionId: { type: String, required: true, index: true },
    items: { type: [materialItemSchema], default: [] },
    status: { type: String, enum: ['draft', 'ordered', 'received', 'cancelled'], default: 'draft' },
  },
  { timestamps: true }
);

export const MaterialOrderModel = model<MaterialOrderDocument>('MaterialOrder', materialOrderSchema);

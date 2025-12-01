import { Schema, model, type Document } from 'mongoose';

interface WorkOrderDocument extends Document {
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
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduledAt: Date | null;
  technicianName?: string;
  technicianId?: string;
  location?: string;
  notes?: string;
}

const workOrderItemSchema = new Schema(
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

const workOrderSchema = new Schema<WorkOrderDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerVersionId: { type: String, required: true, index: true },
    items: { type: [workOrderItemSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'],
      default: 'draft',
    },
    scheduledAt: { type: Date, default: null },
    technicianName: { type: String },
    technicianId: { type: String },
    location: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export const WorkOrderModel = model<WorkOrderDocument>('WorkOrder', workOrderSchema);

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
  status: 'draft' | 'issued' | 'in-progress' | 'confirmed' | 'completed';
  scheduledAt: Date | null;
  technicianName?: string;
  technicianId?: string;
  location?: string;
  notes?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  cancelledAt?: Date | null;
  reopened?: boolean;
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
      enum: ['draft', 'issued', 'in-progress', 'confirmed', 'completed'],
      default: 'draft',
    },
    scheduledAt: { type: Date, default: null },
    technicianName: { type: String },
    technicianId: { type: String },
    location: { type: String },
    notes: { type: String },
    customerName: { type: String },
    customerEmail: { type: String },
    customerPhone: { type: String },
    customerAddress: { type: String },
    cancelledAt: { type: Date, default: null },
    reopened: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const WorkOrderModel = model<WorkOrderDocument>('WorkOrder', workOrderSchema);

import { Schema, model, type Document } from 'mongoose';

interface WorkOrderItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  note?: string;
  offerItemId?: string | null;
  offeredQuantity: number;
  plannedQuantity: number;
  executedQuantity: number;
  isExtra: boolean;
  itemNote?: string | null;
  isCompleted?: boolean;
  casovnaNorma?: number;
}

export interface WorkLogEntry {
  employeeId: string;
  hours: number;
}

interface WorkOrderDocument extends Document {
  projectId: string;
  offerVersionId: string;
  sequence?: number;
  code?: string;
  title?: string;
  items: WorkOrderItem[];
  status: 'draft' | 'issued' | 'in-progress' | 'confirmed' | 'completed';
  scheduledAt: string | null;
  assignedEmployeeIds?: string[];
  location?: string;
  notes?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  cancelledAt?: Date | null;
  reopened?: boolean;
  executionNote?: string | null;
  workLogs: WorkLogEntry[];
}

const workOrderItemSchema = new Schema<WorkOrderItem>(
  {
    id: { type: String, required: true },
    productId: { type: String, default: null },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    note: { type: String },
    offerItemId: { type: String, default: null },
    offeredQuantity: { type: Number, required: true, default: 0 },
    plannedQuantity: { type: Number, required: true, default: 0 },
    executedQuantity: { type: Number, required: true, default: 0 },
    isExtra: { type: Boolean, required: true, default: false },
    itemNote: { type: String, default: null },
    isCompleted: { type: Boolean, default: false },
    casovnaNorma: { type: Number, default: 0 },
  },
  { _id: false }
);

const workLogSchema = new Schema<WorkLogEntry>(
  {
    employeeId: { type: String, required: true },
    hours: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const workOrderSchema = new Schema<WorkOrderDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerVersionId: { type: String, required: true, index: true },
    sequence: { type: Number, default: null },
    code: { type: String, default: null },
    title: { type: String, default: null },
    items: { type: [workOrderItemSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'issued', 'in-progress', 'confirmed', 'completed'],
      default: 'draft',
    },
    scheduledAt: { type: String, default: null },
    assignedEmployeeIds: { type: [Schema.Types.ObjectId], default: [] },
    location: { type: String },
    notes: { type: String },
    customerName: { type: String },
    customerEmail: { type: String },
    customerPhone: { type: String },
    customerAddress: { type: String },
    cancelledAt: { type: Date, default: null },
    reopened: { type: Boolean, default: false },
    executionNote: { type: String, default: null },
    workLogs: { type: [workLogSchema], default: [] },
  },
  { timestamps: true }
);

export const WorkOrderModel = model<WorkOrderDocument>('WorkOrder', workOrderSchema);

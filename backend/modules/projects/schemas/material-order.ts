import { Schema, Types, model, type Document } from 'mongoose';

interface MaterialOrderDocument extends Document {
  projectId: string;
  offerVersionId: string;
  workOrderId?: string;
  items: {
    id: string;
    productId: string | null;
    name: string;
    quantity: number;
    deliveredQty?: number;
    unit: string;
    note?: string;
  }[];
  assignedEmployeeIds?: Array<Types.ObjectId>;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  materialStatus: 'Za naročit' | 'Naročeno' | 'Prevzeto' | 'Pripravljeno' | 'Dostavljeno' | 'Zmontirano';
  cancelledAt?: Date | null;
  reopened?: boolean;
}

const materialItemSchema = new Schema(
  {
    id: { type: String, required: true },
    productId: { type: String, default: null },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    deliveredQty: { type: Number, default: 0 },
    unit: { type: String, required: true },
    note: { type: String },
  },
  { _id: false }
);

const materialOrderSchema = new Schema<MaterialOrderDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerVersionId: { type: String, required: true, index: true },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: false },
    items: { type: [materialItemSchema], default: [] },
    assignedEmployeeIds: { type: [Schema.Types.ObjectId], ref: 'Employee', default: [] },
    status: { type: String, enum: ['draft', 'ordered', 'received', 'cancelled'], default: 'draft' },
    materialStatus: {
      type: String,
      enum: ['Za naročit', 'Naročeno', 'Prevzeto', 'Pripravljeno', 'Dostavljeno', 'Zmontirano'],
      default: 'Za naročit',
    },
    cancelledAt: { type: Date, default: null },
    reopened: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const MaterialOrderModel = model<MaterialOrderDocument>('MaterialOrder', materialOrderSchema);

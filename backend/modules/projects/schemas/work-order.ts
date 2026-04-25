import { Schema, model, type Document } from 'mongoose';

interface WorkOrderItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  isService?: boolean;
  note?: string;
  offerItemId?: string | null;
  offeredQuantity: number;
  plannedQuantity: number;
  executedQuantity: number;
  isExtra: boolean;
  itemNote?: string | null;
  isCompleted?: boolean;
  casovnaNorma?: number;
    executionSpec?: {
      mode?: 'simple' | 'per_unit' | 'measured';
      locationSummary?: string | null;
      instructions?: string | null;
      trackingUnitLabel?: string | null;
    executionUnits?: Array<{
      id: string;
      label: string;
      location?: string | null;
      instructions?: string | null;
      isCompleted: boolean;
      completedBy?: string | null;
      completedByEmployeeId?: string | null;
      executedBy?: string | null;
      executedByEmployeeId?: string | null;
      markedDoneBy?: string | null;
      markedDoneByEmployeeId?: string | null;
      doneBy?: string | null;
      doneByEmployeeId?: string | null;
      note?: string | null;
    }>;
  } | null;
}

export interface WorkLogEntry {
  employeeId: string;
  hours: number;
}

export type WorkOrderConfirmationState = 'unsigned' | 'signed_active' | 'resign_required';
export type WorkOrderConfirmationVersionState = 'active' | 'archived' | 'superseded';

export interface WorkOrderConfirmationVersionItem extends WorkOrderItem {}

export interface WorkOrderConfirmationVersion {
  id: string;
  workOrderId: string;
  projectId: string;
  offerVersionId: string;
  versionNumber: number;
  state: WorkOrderConfirmationVersionState;
  signerName: string;
  customerRemark?: string | null;
  signature: string;
  signedAt?: Date | null;
  items: WorkOrderConfirmationVersionItem[];
  executionNote?: string | null;
  notes?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  scheduledAt?: string | null;
  mainInstallerId?: string | null;
  assignedEmployeeIds?: string[];
  location?: string | null;
  workOrderCode?: string | null;
  workOrderTitle?: string | null;
  workOrderCreatedAt?: Date | null;
  createdAt?: Date | null;
}

export interface WorkOrderDocument extends Document {
  projectId: string;
  offerVersionId: string;
  sequence?: number;
  code?: string;
  title?: string;
  items: WorkOrderItem[];
  status: 'draft' | 'issued' | 'in-progress' | 'confirmed' | 'completed';
  scheduledAt: string | null;
  scheduledConfirmedAt?: Date | null;
  scheduledConfirmedBy?: string | null;
  mainInstallerId?: string | null;
  assignedEmployeeIds?: string[];
  location?: string;
  notes?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerSignerName?: string | null;
  customerSignature?: string | null;
  customerSignedAt?: Date | null;
  customerRemark?: string | null;
  cancelledAt?: Date | null;
  reopened?: boolean;
  executionNote?: string | null;
  workLogs: WorkLogEntry[];
  confirmationState?: WorkOrderConfirmationState;
  confirmationActiveVersionId?: string | null;
  confirmationVersions?: WorkOrderConfirmationVersion[];
}

const workOrderItemSchema = new Schema<WorkOrderItem>(
  {
    id: { type: String, required: true },
    productId: { type: String, default: null },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    isService: { type: Boolean, default: false },
    note: { type: String },
    offerItemId: { type: String, default: null },
    offeredQuantity: { type: Number, required: true, default: 0 },
    plannedQuantity: { type: Number, required: true, default: 0 },
    executedQuantity: { type: Number, required: true, default: 0 },
    isExtra: { type: Boolean, required: true, default: false },
    itemNote: { type: String, default: null },
    isCompleted: { type: Boolean, default: false },
    casovnaNorma: { type: Number, default: 0 },
    executionSpec: {
      type: new Schema(
        {
          mode: {
            type: String,
            enum: ['simple', 'per_unit', 'measured'],
            default: 'simple',
          },
          locationSummary: { type: String, default: null },
          instructions: { type: String, default: null },
          trackingUnitLabel: { type: String, default: null },
          executionUnits: {
            type: [
              new Schema(
                {
                  id: { type: String, required: true },
                  label: { type: String, required: true },
                  location: { type: String, default: null },
                  instructions: { type: String, default: null },
                  isCompleted: { type: Boolean, default: false },
                  completedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  completedByEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  executedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  executedByEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  markedDoneBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  markedDoneByEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  doneBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  doneByEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
                  note: { type: String, default: null },
                },
                { _id: false }
              ),
            ],
            default: [],
          },
        },
        { _id: false }
      ),
      default: null,
    },
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

const workOrderConfirmationVersionSchema = new Schema<WorkOrderConfirmationVersion>(
  {
    id: { type: String, required: true },
    workOrderId: { type: String, required: true },
    projectId: { type: String, required: true },
    offerVersionId: { type: String, required: true },
    versionNumber: { type: Number, required: true },
    state: {
      type: String,
      enum: ['active', 'archived', 'superseded'],
      default: 'archived',
    },
    signerName: { type: String, required: true },
    customerRemark: { type: String, default: null },
    signature: { type: String, required: true },
    signedAt: { type: Date, default: null },
    items: { type: [workOrderItemSchema], default: [] },
    executionNote: { type: String, default: null },
    notes: { type: String, default: null },
    customerName: { type: String, default: null },
    customerEmail: { type: String, default: null },
    customerPhone: { type: String, default: null },
    customerAddress: { type: String, default: null },
    scheduledAt: { type: String, default: null },
    mainInstallerId: { type: String, default: null },
    assignedEmployeeIds: { type: [String], default: [] },
    location: { type: String, default: null },
    workOrderCode: { type: String, default: null },
    workOrderTitle: { type: String, default: null },
    workOrderCreatedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
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
    scheduledConfirmedAt: { type: Date, default: null },
    scheduledConfirmedBy: { type: String, default: null },
    mainInstallerId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedEmployeeIds: { type: [Schema.Types.ObjectId], default: [] },
    location: { type: String },
    notes: { type: String },
    customerName: { type: String },
    customerEmail: { type: String },
    customerPhone: { type: String },
    customerAddress: { type: String },
    customerSignerName: { type: String, default: null },
    customerSignature: { type: String, default: null },
    customerSignedAt: { type: Date, default: null },
    customerRemark: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    reopened: { type: Boolean, default: false },
    executionNote: { type: String, default: null },
    workLogs: { type: [workLogSchema], default: [] },
    confirmationState: {
      type: String,
      enum: ['unsigned', 'signed_active', 'resign_required'],
      default: 'unsigned',
    },
    confirmationActiveVersionId: { type: String, default: null },
    confirmationVersions: { type: [workOrderConfirmationVersionSchema], default: [] },
  },
  { timestamps: true }
);

export const WorkOrderModel = model<WorkOrderDocument>('WorkOrder', workOrderSchema);

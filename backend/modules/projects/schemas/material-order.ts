import { Schema, Types, model, type Document } from "mongoose";

interface MaterialOrderDocument extends Document {
  projectId: string;
  offerVersionId: string;
  workOrderId?: string;
  items: {
    id: string;
    productId: string | null;
    name: string;
    quantity: number;
    isOrdered?: boolean;
    orderedQty?: number;
    deliveredQty?: number;
    unit: string;
    note?: string;
    dobavitelj?: string;
    naslovDobavitelja?: string;
    materialStep?: "Za naročiti" | "Naročeno" | "Za prevzem" | "Prevzeto" | "Pripravljeno";
    isExtra?: boolean;
  }[];
  assignedEmployeeIds?: Array<Types.ObjectId>;
  pickupMethod?: "COMPANY_PICKUP" | "SUPPLIER_PICKUP" | "DIRECT_TO_INSTALLER" | "DIRECT_TO_SITE" | null;
  pickupLocation?: string | null;
  logisticsOwnerId?: Types.ObjectId | null;
  pickupNote?: string | null;
  deliveryNotePhotos?: string[];
  pickupConfirmedAt?: Date | null;
  pickupConfirmedBy?: string | null;
  status: "draft" | "ordered" | "received" | "cancelled";
  materialStatus: "Za naročit" | "Naročeno" | "Prevzeto" | "Pripravljeno" | "Dostavljeno" | "Zmontirano";
  cancelledAt?: Date | null;
  reopened?: boolean;
}

const materialItemSchema = new Schema(
  {
    id: { type: String, required: true },
    productId: { type: String, default: null },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    isOrdered: { type: Boolean, default: false },
    orderedQty: { type: Number, default: 0 },
    deliveredQty: { type: Number, default: 0 },
    unit: { type: String, required: true },
    note: { type: String },
    dobavitelj: { type: String, trim: true, default: "" },
    naslovDobavitelja: { type: String, trim: true, default: "" },
    materialStep: {
      type: String,
      enum: ["Za naročiti", "Naročeno", "Za prevzem", "Prevzeto", "Pripravljeno"],
      default: "Za naročiti",
    },
    isExtra: { type: Boolean, default: false },
  },
  { _id: false },
);

const materialOrderSchema = new Schema<MaterialOrderDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerVersionId: { type: String, required: true, index: true },
    workOrderId: { type: Schema.Types.ObjectId, ref: "WorkOrder", required: false },
    items: { type: [materialItemSchema], default: [] },
    assignedEmployeeIds: { type: [Schema.Types.ObjectId], ref: "Employee", default: [] },
    pickupMethod: {
      type: String,
      enum: ["COMPANY_PICKUP", "SUPPLIER_PICKUP", "DIRECT_TO_INSTALLER", "DIRECT_TO_SITE"],
      default: null,
    },
    pickupLocation: { type: String, default: null },
    logisticsOwnerId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    pickupNote: { type: String, default: null },
    deliveryNotePhotos: { type: [String], default: [] },
    pickupConfirmedAt: { type: Date, default: null },
    pickupConfirmedBy: { type: String, default: null },
    status: { type: String, enum: ["draft", "ordered", "received", "cancelled"], default: "draft" },
    materialStatus: {
      type: String,
      enum: ["Za naročit", "Naročeno", "Prevzeto", "Pripravljeno", "Dostavljeno", "Zmontirano"],
      default: "Za naročit",
    },
    cancelledAt: { type: Date, default: null },
    reopened: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const MaterialOrderModel = model<MaterialOrderDocument>("MaterialOrder", materialOrderSchema);

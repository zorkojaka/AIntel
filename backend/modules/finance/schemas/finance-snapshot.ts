import mongoose, { Document, Model, Schema } from 'mongoose';

export type FinanceSnapshotItemType = 'Osnovno' | 'Dodatno' | 'Manj';

export interface FinanceSnapshotItem {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPriceSale: number;
  unitPricePurchase: number;
  vatPercent: number;
  totalSale: number;
  totalPurchase: number;
  margin: number;
  isService: boolean;
  categorySlugs: string[];
  type: FinanceSnapshotItemType;
}

export interface FinanceSnapshotEmployeeEarning {
  employeeId: string;
  earnings: number;
  isPaid: boolean;
  paidAt: Date | null;
  paidBy: string | null;
}

export interface FinanceSnapshotDocument extends Document {
  projectId: string;
  invoiceVersionId: string;
  invoiceNumber: string;
  issuedAt: Date;
  customer: {
    name: string;
    taxId: string;
    address: string;
  };
  items: FinanceSnapshotItem[];
  summary: {
    totalSaleWithoutVat: number;
    totalPurchase: number;
    totalMargin: number;
    totalVat: number;
    totalSaleWithVat: number;
  };
  assignedEmployeeIds: string[];
  employeeEarnings: FinanceSnapshotEmployeeEarning[];
  offerVersionId: string;
  salesUserId: string | null;
  snapshotVersion: number;
  correctedFromSnapshotId: string | null;
  superseded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceSnapshotItemSchema = new Schema<FinanceSnapshotItem>(
  {
    productId: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPriceSale: { type: Number, required: true, min: 0 },
    unitPricePurchase: { type: Number, required: true, min: 0 },
    vatPercent: { type: Number, required: true, min: 0 },
    totalSale: { type: Number, required: true },
    totalPurchase: { type: Number, required: true },
    margin: { type: Number, required: true },
    isService: { type: Boolean, required: true, default: false },
    categorySlugs: { type: [String], default: [] },
    type: { type: String, enum: ['Osnovno', 'Dodatno', 'Manj'], required: true },
  },
  { _id: false }
);

const FinanceSnapshotEmployeeEarningSchema = new Schema<FinanceSnapshotEmployeeEarning>(
  {
    employeeId: { type: String, required: true },
    earnings: { type: Number, required: true, default: 0 },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
  },
  { _id: false }
);

const FinanceSnapshotSchema = new Schema<FinanceSnapshotDocument>(
  {
    projectId: { type: String, required: true, index: true },
    invoiceVersionId: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true },
    issuedAt: { type: Date, required: true, index: true },
    customer: {
      name: { type: String, default: '' },
      taxId: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    items: { type: [FinanceSnapshotItemSchema], default: [] },
    summary: {
      totalSaleWithoutVat: { type: Number, required: true, default: 0 },
      totalPurchase: { type: Number, required: true, default: 0 },
      totalMargin: { type: Number, required: true, default: 0 },
      totalVat: { type: Number, required: true, default: 0 },
      totalSaleWithVat: { type: Number, required: true, default: 0 },
    },
    assignedEmployeeIds: { type: [String], default: [] },
    employeeEarnings: { type: [FinanceSnapshotEmployeeEarningSchema], default: [] },
    offerVersionId: { type: String, required: true, default: '' },
    salesUserId: { type: String, default: null },
    snapshotVersion: { type: Number, required: true, default: 1 },
    correctedFromSnapshotId: { type: String, default: null },
    superseded: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true }
);

FinanceSnapshotSchema.index({ projectId: 1, issuedAt: -1 });

export const FinanceSnapshotModel: Model<FinanceSnapshotDocument> =
  (mongoose.models.FinanceSnapshot as Model<FinanceSnapshotDocument>) ||
  mongoose.model<FinanceSnapshotDocument>('FinanceSnapshot', FinanceSnapshotSchema);

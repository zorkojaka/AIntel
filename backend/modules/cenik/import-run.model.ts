import mongoose, { Document, Model, Schema } from 'mongoose';

export type ProductImportRunMode = 'analyze' | 'apply';
export type ProductImportRunStatus = 'success' | 'partial' | 'failed';

export interface ProductImportRunDocument extends Document {
  source: string;
  mode: ProductImportRunMode;
  startedAt: Date;
  finishedAt?: Date;
  triggeredBy?: string;
  status: ProductImportRunStatus;
  totalSourceRows: number;
  matchedRows: number;
  toCreateCount: number;
  toUpdateCount: number;
  toSkipCount: number;
  conflictCount: number;
  invalidCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unresolvedConflictCount: number;
  sourceFingerprint?: string;
  warnings: string[];
  errorSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductImportRunSchema = new Schema<ProductImportRunDocument>(
  {
    source: { type: String, required: true, trim: true },
    mode: { type: String, required: true, enum: ['analyze', 'apply'] },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: undefined },
    triggeredBy: { type: String, trim: true, default: '' },
    status: { type: String, required: true, enum: ['success', 'partial', 'failed'] },
    totalSourceRows: { type: Number, required: true, default: 0 },
    matchedRows: { type: Number, required: true, default: 0 },
    toCreateCount: { type: Number, required: true, default: 0 },
    toUpdateCount: { type: Number, required: true, default: 0 },
    toSkipCount: { type: Number, required: true, default: 0 },
    conflictCount: { type: Number, required: true, default: 0 },
    invalidCount: { type: Number, required: true, default: 0 },
    createdCount: { type: Number, required: true, default: 0 },
    updatedCount: { type: Number, required: true, default: 0 },
    skippedCount: { type: Number, required: true, default: 0 },
    unresolvedConflictCount: { type: Number, required: true, default: 0 },
    sourceFingerprint: { type: String, trim: true, default: '' },
    warnings: { type: [String], default: [] },
    errorSummary: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
  },
);

ProductImportRunSchema.index({ startedAt: -1 });
ProductImportRunSchema.index({ source: 1, startedAt: -1 });

export const ProductImportRunModel: Model<ProductImportRunDocument> =
  (mongoose.models.ProductImportRun as Model<ProductImportRunDocument>) ||
  mongoose.model<ProductImportRunDocument>('ProductImportRun', ProductImportRunSchema);

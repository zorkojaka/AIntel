import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ExecutionTriggerType = 'product' | 'classification' | 'category' | 'project';
export type ExecutionQuantityRuleType = 'fixed' | 'per_unit' | 'per_classification_field';
export type ExecutionScenarioType = 'posiljanje' | 'izvedba' | 'izvedba_napeljava';

export interface ExecutionQuantityRule {
  type: ExecutionQuantityRuleType;
  value?: number;
  field?: string;
}

export interface ProductServiceExecutionRule {
  id: string;
  triggerType: ExecutionTriggerType;
  triggerValue: string;
  triggerField?: string;
  triggerFieldValue?: string;
  serviceProductId: Types.ObjectId;
  quantityRule: ExecutionQuantityRule;
  isActive: boolean;
}

export interface ExecutionScenarioService {
  id: string;
  serviceProductId: Types.ObjectId;
  quantityRule: ExecutionQuantityRule;
  description?: string;
}

export interface ExecutionScenario {
  type: ExecutionScenarioType;
  ime: string;
  storitve: ExecutionScenarioService[];
  defaultEstimates?: {
    napeljavaUrPerKamera: number;
    utpKabelMetrovPerKamera: number;
    kanalMetrovPerKamera: number;
  };
}

export interface ExecutionRuleSettingsDocument extends Document {
  tenantId: string;
  createdBy?: Types.ObjectId | null;
  productServiceRules: ProductServiceExecutionRule[];
  scenarios: ExecutionScenario[];
  createdAt: Date;
  updatedAt: Date;
}

const QuantityRuleSchema = new Schema<ExecutionQuantityRule>(
  {
    type: {
      type: String,
      enum: ['fixed', 'per_unit', 'per_classification_field'],
      required: true,
      default: 'fixed',
    },
    value: { type: Number, default: 1 },
    field: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const ProductServiceRuleSchema = new Schema<ProductServiceExecutionRule>(
  {
    id: { type: String, required: true, trim: true },
    triggerType: {
      type: String,
      enum: ['product', 'classification', 'category', 'project'],
      required: true,
    },
    triggerValue: { type: String, required: true, trim: true },
    triggerField: { type: String, trim: true, default: '' },
    triggerFieldValue: { type: String, trim: true, default: '' },
    serviceProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantityRule: { type: QuantityRuleSchema, required: true, default: () => ({ type: 'fixed', value: 1 }) },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const ScenarioServiceSchema = new Schema<ExecutionScenarioService>(
  {
    id: { type: String, required: true, trim: true },
    serviceProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantityRule: { type: QuantityRuleSchema, required: true, default: () => ({ type: 'fixed', value: 1 }) },
    description: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const ScenarioSchema = new Schema<ExecutionScenario>(
  {
    type: {
      type: String,
      enum: ['posiljanje', 'izvedba', 'izvedba_napeljava'],
      required: true,
    },
    ime: { type: String, required: true, trim: true },
    storitve: { type: [ScenarioServiceSchema], default: [] },
    defaultEstimates: {
      napeljavaUrPerKamera: { type: Number, min: 0, default: 2 },
      utpKabelMetrovPerKamera: { type: Number, min: 0, default: 20 },
      kanalMetrovPerKamera: { type: Number, min: 0, default: 4 },
    },
  },
  { _id: false },
);

const ExecutionRuleSettingsSchema = new Schema<ExecutionRuleSettingsDocument>(
  {
    tenantId: { type: String, required: true, trim: true, index: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    productServiceRules: { type: [ProductServiceRuleSchema], default: [] },
    scenarios: { type: [ScenarioSchema], default: [] },
  },
  { timestamps: true },
);

export const ExecutionRuleSettingsModel: Model<ExecutionRuleSettingsDocument> =
  (mongoose.models.ExecutionRuleSettings as Model<ExecutionRuleSettingsDocument>) ||
  mongoose.model<ExecutionRuleSettingsDocument>('ExecutionRuleSettings', ExecutionRuleSettingsSchema);

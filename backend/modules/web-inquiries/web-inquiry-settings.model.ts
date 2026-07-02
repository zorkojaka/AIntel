import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type WebInquiryScenarioType = 'posiljanje' | 'izvedba' | 'izvedba_napeljava';

export interface WebInquirySettingsDocument extends Document {
  tenantId: string;
  enabled: boolean;
  autoSendEmail: boolean;
  emailTemplateKey: string | null;
  videonadzor: {
    wifiCameraProductId: Types.ObjectId | null;
    wiredCameraProductId: Types.ObjectId | null;
    includeBrackets: boolean;
    dniSnemanja: number;
    motionRecord: boolean;
    scenarioWifi: WebInquiryScenarioType;
    scenarioWiringReady: WebInquiryScenarioType;
    scenarioWiringNotReady: WebInquiryScenarioType;
    napeljavaUrPerCamera: number;
    utpKabelMetrovPerCamera: number;
    kanalMetrovPerCamera: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SCENARIO_ENUM: WebInquiryScenarioType[] = ['posiljanje', 'izvedba', 'izvedba_napeljava'];

const WebInquirySettingsSchema = new Schema<WebInquirySettingsDocument>(
  {
    tenantId: { type: String, required: true, unique: true, default: 'inteligent' },
    enabled: { type: Boolean, default: false },
    autoSendEmail: { type: Boolean, default: true },
    emailTemplateKey: { type: String, default: null, trim: true },
    videonadzor: {
      wifiCameraProductId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
      wiredCameraProductId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
      includeBrackets: { type: Boolean, default: true },
      dniSnemanja: { type: Number, min: 7, max: 90, default: 30 },
      motionRecord: { type: Boolean, default: false },
      scenarioWifi: { type: String, enum: SCENARIO_ENUM, default: 'izvedba' },
      scenarioWiringReady: { type: String, enum: SCENARIO_ENUM, default: 'izvedba' },
      scenarioWiringNotReady: { type: String, enum: SCENARIO_ENUM, default: 'izvedba_napeljava' },
      napeljavaUrPerCamera: { type: Number, min: 0, default: 1 },
      utpKabelMetrovPerCamera: { type: Number, min: 0, default: 20 },
      kanalMetrovPerCamera: { type: Number, min: 0, default: 5 },
    },
  },
  { timestamps: true }
);

export const WebInquirySettingsModel: Model<WebInquirySettingsDocument> =
  (mongoose.models.WebInquirySettings as Model<WebInquirySettingsDocument>) ||
  (mongoose.model('WebInquirySettings', WebInquirySettingsSchema as any, 'web_inquiry_settings') as Model<WebInquirySettingsDocument>);

export async function getWebInquirySettings(tenantId = 'inteligent') {
  const existing = await WebInquirySettingsModel.findOne({ tenantId });
  if (existing) return existing;
  return WebInquirySettingsModel.create({ tenantId });
}

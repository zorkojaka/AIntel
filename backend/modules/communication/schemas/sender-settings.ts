import mongoose, { Schema, model, type Document, type Model } from "mongoose";

export interface CommunicationSenderSettingsDocument extends Document {
  _id: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string | null;
  senderRole?: string | null;
  defaultCc?: string | null;
  defaultBcc?: string | null;
  replyToEmail?: string | null;
  emailFooterTemplate?: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationSenderSettingsSchema = new Schema<CommunicationSenderSettingsDocument>(
  {
    _id: { type: String, default: "singleton" },
    senderName: { type: String, required: true, trim: true },
    senderEmail: { type: String, required: true, trim: true, lowercase: true },
    senderPhone: { type: String, default: null, trim: true },
    senderRole: { type: String, default: null, trim: true },
    defaultCc: { type: String, default: null, trim: true },
    defaultBcc: { type: String, default: null, trim: true },
    replyToEmail: { type: String, default: null, trim: true, lowercase: true },
    emailFooterTemplate: { type: String, default: null },
    enabled: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, versionKey: false, collection: "communication_sender_settings" }
);

export const CommunicationSenderSettingsModel: Model<CommunicationSenderSettingsDocument> =
  (mongoose.models.CommunicationSenderSettings as Model<CommunicationSenderSettingsDocument>) ||
  model<CommunicationSenderSettingsDocument>("CommunicationSenderSettings", CommunicationSenderSettingsSchema);

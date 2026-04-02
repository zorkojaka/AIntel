import mongoose, { Schema, model, type Document, type Model } from "mongoose";
import type { CommunicationAttachmentType, CommunicationCategory } from "../../../../shared/types/communication";

export interface CommunicationTemplateDocument extends Document {
  key: string;
  name: string;
  category: CommunicationCategory;
  subjectTemplate: string;
  bodyTemplate: string;
  defaultAttachments: CommunicationAttachmentType[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationTemplateSchema = new Schema<CommunicationTemplateDocument>(
  {
    key: { type: String, required: true, trim: true, lowercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "offer_send" },
    subjectTemplate: { type: String, required: true, trim: true },
    bodyTemplate: { type: String, required: true },
    defaultAttachments: {
      type: [{ type: String, enum: ["offer_pdf", "project_pdf", "work_order_confirmation_pdf"] }],
      default: [],
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, versionKey: false, collection: "communication_templates" }
);

CommunicationTemplateSchema.index({ category: 1, isActive: 1, name: 1 });

export const CommunicationTemplateModel: Model<CommunicationTemplateDocument> =
  (mongoose.models.CommunicationTemplate as Model<CommunicationTemplateDocument>) ||
  model<CommunicationTemplateDocument>("CommunicationTemplate", CommunicationTemplateSchema);

import mongoose, { Schema, model, type Document, type Model } from "mongoose";
import type {
  CommunicationAttachmentType,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationMessageStatus,
} from "../../../../shared/types/communication";

interface CommunicationAttachmentRecord {
  type: CommunicationAttachmentType;
  refId: string;
  filename: string;
}

export interface CommunicationMessageDocument extends Document {
  projectId: string;
  offerId?: string | null;
  customerId?: string | null;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  to: string[];
  cc: string[];
  bcc: string[];
  subjectFinal: string;
  bodyFinal: string;
  templateId?: string | null;
  templateKey?: string | null;
  selectedAttachments: CommunicationAttachmentRecord[];
  status: CommunicationMessageStatus;
  sentAt?: Date | null;
  sentByUserId?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationAttachmentSchema = new Schema<CommunicationAttachmentRecord>(
  {
    type: { type: String, required: true, enum: ["offer_pdf", "project_pdf", "work_order_confirmation_pdf"] },
    refId: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const CommunicationMessageSchema = new Schema<CommunicationMessageDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerId: { type: String, default: null, index: true },
    customerId: { type: String, default: null, index: true },
    direction: { type: String, required: true, enum: ["outbound", "inbound"], default: "outbound" },
    channel: { type: String, required: true, enum: ["email"], default: "email" },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subjectFinal: { type: String, required: true, trim: true },
    bodyFinal: { type: String, required: true },
    templateId: { type: String, default: null },
    templateKey: { type: String, default: null },
    selectedAttachments: { type: [CommunicationAttachmentSchema], default: [] },
    status: { type: String, required: true, enum: ["sent", "failed"], default: "sent" },
    sentAt: { type: Date, default: null },
    sentByUserId: { type: String, default: null },
    providerMessageId: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, versionKey: false, collection: "communication_messages" }
);

CommunicationMessageSchema.index({ projectId: 1, createdAt: -1 });
CommunicationMessageSchema.index({ offerId: 1, createdAt: -1 });

export const CommunicationMessageModel: Model<CommunicationMessageDocument> =
  (mongoose.models.CommunicationMessage as Model<CommunicationMessageDocument>) ||
  model<CommunicationMessageDocument>("CommunicationMessage", CommunicationMessageSchema);

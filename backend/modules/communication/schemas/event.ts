import mongoose, { Schema, model, type Document, type Model } from "mongoose";
import type { CommunicationEventType } from "../../../../shared/types/communication";

export interface CommunicationEventDocument extends Document {
  projectId: string;
  offerId?: string | null;
  messageId?: string | null;
  type: CommunicationEventType;
  title: string;
  description: string;
  timestamp: Date;
  user?: string | null;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationEventSchema = new Schema<CommunicationEventDocument>(
  {
    projectId: { type: String, required: true, index: true },
    offerId: { type: String, default: null, index: true },
    messageId: { type: String, default: null, index: true },
    type: {
      type: String,
      required: true,
      enum: ["email_sent", "email_failed", "offer_confirmed", "signature_completed", "system_note"],
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    timestamp: { type: Date, required: true, default: Date.now },
    user: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "communication_events" }
);

CommunicationEventSchema.index({ projectId: 1, timestamp: -1 });

export const CommunicationEventModel: Model<CommunicationEventDocument> =
  (mongoose.models.CommunicationEvent as Model<CommunicationEventDocument>) ||
  model<CommunicationEventDocument>("CommunicationEvent", CommunicationEventSchema);

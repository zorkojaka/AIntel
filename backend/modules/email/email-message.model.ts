import mongoose, { Document, Model, Schema } from 'mongoose';

// AIN-P1-14: dohodna pošta iz namenskega nabiralnika (prodaja@) — surova
// sporočila za resolve center. Nabiralnika nikoli ne spreminjamo (samo
// beremo); sled napredka drži email_ingest_state (zadnji obdelani UID).

export const EMAIL_MESSAGE_STATUSES = ['new', 'matched', 'unmatched', 'ignored'] as const;
export type EmailMessageStatus = (typeof EMAIL_MESSAGE_STATUSES)[number];

export interface EmailMessageDocument extends Document {
  tenantId: string;
  messageId?: string; // RFC Message-ID dohodnega sporočila
  inReplyTo?: string;
  references: string[];
  fromAddress: string;
  fromName?: string;
  to: string[];
  subject: string;
  date: Date;
  text: string; // očiščeno besedilo (omejena dolžina)
  attachmentsMeta: Array<{ filename: string; size: number; contentType: string }>;
  folder: string;
  uid: number;
  direction: 'inbound';
  match?: {
    projectId?: string;
    clientId?: mongoose.Types.ObjectId;
    offerId?: string;
    communicationMessageId?: mongoose.Types.ObjectId;
    matchedBy?: 'reply' | 'client-email' | 'document-number' | 'manual';
  };
  status: EmailMessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

const EmailMessageSchema = new Schema<EmailMessageDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent' },
    messageId: { type: String, trim: true, default: undefined },
    inReplyTo: { type: String, trim: true, default: undefined },
    references: { type: [String], default: [] },
    fromAddress: { type: String, required: true, trim: true, lowercase: true },
    fromName: { type: String, trim: true, default: '' },
    to: { type: [String], default: [] },
    subject: { type: String, trim: true, default: '' },
    date: { type: Date, required: true },
    text: { type: String, default: '' },
    attachmentsMeta: {
      type: [
        {
          filename: { type: String, trim: true, default: '' },
          size: { type: Number, default: 0 },
          contentType: { type: String, trim: true, default: '' },
          _id: false,
        },
      ],
      default: [],
    },
    folder: { type: String, trim: true, default: 'INBOX' },
    uid: { type: Number, required: true },
    direction: { type: String, enum: ['inbound'], required: true, default: 'inbound' },
    match: {
      type: {
        projectId: { type: String, trim: true, default: undefined },
        clientId: { type: Schema.Types.ObjectId, default: undefined },
        offerId: { type: String, trim: true, default: undefined },
        communicationMessageId: { type: Schema.Types.ObjectId, default: undefined },
        matchedBy: { type: String, enum: ['reply', 'client-email', 'document-number', 'manual'], default: undefined },
      },
      _id: false,
      required: false,
      default: undefined,
    },
    status: { type: String, enum: EMAIL_MESSAGE_STATUSES, required: true, default: 'new' },
  },
  { timestamps: true, collection: 'email_messages' },
);

// Isti mail se ob ponovnem branju ne podvoji.
EmailMessageSchema.index({ folder: 1, uid: 1 }, { unique: true });
EmailMessageSchema.index({ messageId: 1 }, { sparse: true });
EmailMessageSchema.index({ tenantId: 1, status: 1, date: -1 });
EmailMessageSchema.index({ 'match.projectId': 1, date: -1 });
EmailMessageSchema.index({ fromAddress: 1, date: -1 });

export const EmailMessageModel: Model<EmailMessageDocument> =
  mongoose.models.EmailMessage || mongoose.model<EmailMessageDocument>('EmailMessage', EmailMessageSchema);

// Stanje branja nabiralnika: zadnji obdelani UID + uidValidity (če se
// spremeni, IMAP UID-ji niso več primerljivi in beremo previdno znova).
export interface EmailIngestStateDocument extends Document {
  _id: string; // folder
  lastUid: number;
  uidValidity?: string;
  lastRunAt?: Date;
  lastError?: string;
}

const EmailIngestStateSchema = new Schema<EmailIngestStateDocument>(
  {
    _id: { type: String },
    lastUid: { type: Number, required: true, default: 0 },
    uidValidity: { type: String, default: undefined },
    lastRunAt: { type: Date, default: undefined },
    lastError: { type: String, default: undefined },
  },
  { collection: 'email_ingest_state' },
);

export const EmailIngestStateModel: Model<EmailIngestStateDocument> =
  mongoose.models.EmailIngestState || mongoose.model<EmailIngestStateDocument>('EmailIngestState', EmailIngestStateSchema);

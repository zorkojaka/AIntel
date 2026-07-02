import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type WebInquiryPillar = 'videonadzor' | 'alarm' | 'domofon' | 'pametni_dom';
export type WebInquiryStatus = 'novo' | 'ponudba_poslana' | 'ponudba_ni_poslana' | 'napaka';

export interface WebInquiryDocument extends Document {
  tenantId: string;
  pillar: WebInquiryPillar;
  status: WebInquiryStatus;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    siteAddress: {
      street: string;
      postalCode: string;
      city: string;
      full: string;
    };
  };
  payload: Record<string, unknown>;
  note?: string;
  source?: string;
  clientId?: Types.ObjectId | null;
  projectId?: string | null;
  zahtevaId?: Types.ObjectId | null;
  offerId?: Types.ObjectId | null;
  offerNumber?: string | null;
  offerTotalWithVat?: number | null;
  emailSent: boolean;
  defaultsApplied: string[];
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebInquirySchema = new Schema<WebInquiryDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent', index: true },
    pillar: {
      type: String,
      enum: ['videonadzor', 'alarm', 'domofon', 'pametni_dom'],
      required: true,
    },
    status: {
      type: String,
      enum: ['novo', 'ponudba_poslana', 'ponudba_ni_poslana', 'napaka'],
      default: 'novo',
      index: true,
    },
    contact: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
      siteAddress: {
        street: { type: String, trim: true, default: '' },
        postalCode: { type: String, trim: true, default: '' },
        city: { type: String, trim: true, default: '' },
        full: { type: String, trim: true, default: '' },
      },
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    note: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: 'web' },
    clientId: { type: Schema.Types.ObjectId, ref: 'CrmClient', default: null },
    projectId: { type: String, default: null },
    zahtevaId: { type: Schema.Types.ObjectId, ref: 'Zahteva', default: null },
    offerId: { type: Schema.Types.ObjectId, ref: 'OfferVersion', default: null },
    offerNumber: { type: String, default: null },
    offerTotalWithVat: { type: Number, default: null },
    emailSent: { type: Boolean, default: false },
    defaultsApplied: { type: [String], default: [] },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

WebInquirySchema.index({ 'contact.email': 1, pillar: 1, createdAt: -1 });

export const WebInquiryModel: Model<WebInquiryDocument> =
  (mongoose.models.WebInquiry as Model<WebInquiryDocument>) ||
  (mongoose.model('WebInquiry', WebInquirySchema as any, 'web_inquiries') as Model<WebInquiryDocument>);

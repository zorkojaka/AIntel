import mongoose, { Document, Model, Schema } from 'mongoose';

export type PdfDocumentType =
  | 'OFFER'
  | 'INVOICE'
  | 'PURCHASE_ORDER'
  | 'DELIVERY_NOTE'
  | 'WORK_ORDER'
  | 'WORK_ORDER_CONFIRMATION'
  | 'CREDIT_NOTE';

export interface PdfCompanySettings {
  companyName: string;
  address: string;
  email?: string;
  phone?: string;
  vatId?: string;
  iban?: string;
  directorName?: string;
  logoUrl?: string;
  logoAssetId?: string;
}

export interface PdfCompanySettingsDocument extends PdfCompanySettings, Document {
  _id: string;
  updatedAt: Date;
  createdAt: Date;
}

const PdfCompanySettingsSchema = new Schema<PdfCompanySettingsDocument>(
  {
    _id: { type: String, default: 'singleton' },
    companyName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    vatId: { type: String, trim: true },
    iban: { type: String, trim: true },
    directorName: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    logoAssetId: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false, collection: 'pdf_company_settings' }
);

export const PdfCompanySettingsModel: Model<PdfCompanySettingsDocument> =
  (mongoose.models.PdfCompanySettings as Model<PdfCompanySettingsDocument>) ||
  mongoose.model<PdfCompanySettingsDocument>('PdfCompanySettings', PdfCompanySettingsSchema);

export interface PdfNumberingRule {
  prefix: string;
  formatPreset: 'PREFIX-YYYY-SEQ' | 'PREFIX-YY-SEQ' | 'PREFIX-SEQ';
  nextSequence: number;
  resetPolicy: 'yearly' | 'never';
  padding: number;
}

export interface PdfDocumentDefaultTexts {
  paymentTerms?: string;
  disclaimer?: string;
}

export interface PdfDocumentSettings {
  docType: PdfDocumentType;
  numberingRule: PdfNumberingRule;
  defaultTexts: PdfDocumentDefaultTexts;
  templateHtml?: string | null;
}

export interface PdfDocumentSettingsDocument extends PdfDocumentSettings, Document {
  _id: string;
  updatedAt: Date;
  createdAt: Date;
}

const PdfDocumentSettingsSchema = new Schema<PdfDocumentSettingsDocument>(
  {
    docType: { type: String, required: true, unique: true },
    numberingRule: {
      prefix: { type: String, required: true, default: 'PON' },
      formatPreset: { type: String, required: true, default: 'PREFIX-YYYY-SEQ' },
      nextSequence: { type: Number, required: true, default: 1, min: 1 },
      resetPolicy: { type: String, required: true, default: 'yearly' },
      padding: { type: Number, required: true, default: 3, min: 1, max: 6 },
    },
    defaultTexts: {
      paymentTerms: { type: String, default: '' },
      disclaimer: { type: String, default: '' },
    },
    templateHtml: { type: String, default: null },
  },
  { timestamps: true, versionKey: false, collection: 'pdf_document_settings' }
);

export const PdfDocumentSettingsModel: Model<PdfDocumentSettingsDocument> =
  (mongoose.models.PdfDocumentSettings as Model<PdfDocumentSettingsDocument>) ||
  mongoose.model<PdfDocumentSettingsDocument>('PdfDocumentSettings', PdfDocumentSettingsSchema);

export interface OfferPdfOverride {
  offerVersionId: string;
  companyEmail?: string;
  companyPhone?: string;
  paymentTerms?: string;
  disclaimer?: string;
  documentNumberOverride?: string;
  documentNumberReason?: string;
}

export interface OfferPdfOverrideDocument extends OfferPdfOverride, Document {
  _id: string;
  updatedAt: Date;
  createdAt: Date;
}

const OfferPdfOverrideSchema = new Schema<OfferPdfOverrideDocument>(
  {
    offerVersionId: { type: String, required: true, unique: true, index: true },
    companyEmail: { type: String, trim: true },
    companyPhone: { type: String, trim: true },
    paymentTerms: { type: String, trim: true },
    disclaimer: { type: String, trim: true },
    documentNumberOverride: { type: String, trim: true },
    documentNumberReason: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false, collection: 'offer_pdf_overrides' }
);

export const OfferPdfOverrideModel: Model<OfferPdfOverrideDocument> =
  (mongoose.models.OfferPdfOverride as Model<OfferPdfOverrideDocument>) ||
  mongoose.model<OfferPdfOverrideDocument>('OfferPdfOverride', OfferPdfOverrideSchema);

export const DEFAULT_COMPANY_SETTINGS: PdfCompanySettings = {
  companyName: 'Vase podjetje d.o.o.',
  address: 'Glavna cesta 1, 1000 Ljubljana',
  email: 'info@podjetje.si',
  phone: '+386 1 123 45 67',
  vatId: '',
  iban: '',
  directorName: '',
  logoUrl: '',
  logoAssetId: '',
};

export const DEFAULT_DOCUMENT_SETTINGS: PdfDocumentSettings = {
  docType: 'OFFER',
  numberingRule: {
    prefix: 'PON',
    formatPreset: 'PREFIX-YYYY-SEQ',
    nextSequence: 1,
    resetPolicy: 'yearly',
    padding: 3,
  },
  defaultTexts: {
    paymentTerms: 'Placilo v 15 dneh po izstavitvi racuna.',
    disclaimer: 'Ponudba je informativne narave. Prosimo, preverite podatke pred potrditvijo.',
  },
  templateHtml: null,
};

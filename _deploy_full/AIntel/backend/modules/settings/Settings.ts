import { Schema, model, Document } from 'mongoose';

export interface DocumentPrefix {
  offer: string;
  invoice: string;
  order: string;
  deliveryNote: string;
  workOrder: string;
}

export type DocumentTypeKey =
  | 'offer'
  | 'invoice'
  | 'workOrder'
  | 'materialOrder'
  | 'deliveryNote'
  | 'workOrderConfirmation'
  | 'creditNote';

export type NoteCategory = 'payment' | 'delivery' | 'note' | 'costs';

export interface Note {
  id: string;
  title: string;
  text: string;
  category: NoteCategory;
  sortOrder: number;
}

export type NoteDefaultsByDoc = Record<DocumentTypeKey, string[]>;

export interface LegacyOfferClause {
  id: string;
  title: string;
  text: string;
  category: NoteCategory;
  isDefault?: boolean;
  sortOrder?: number;
}

export type DocumentNumberingReset = 'never' | 'yearly';

export interface DocumentNumberingConfig {
  pattern: string;
  reset?: DocumentNumberingReset;
  yearOverride?: number | null;
  seqOverride?: number | null;
}

export interface DocumentNumberingSettings {
  offer?: DocumentNumberingConfig;
  invoice?: DocumentNumberingConfig;
  materialOrder?: DocumentNumberingConfig;
  deliveryNote?: DocumentNumberingConfig;
  workOrder?: DocumentNumberingConfig;
  workOrderConfirmation?: DocumentNumberingConfig;
  creditNote?: DocumentNumberingConfig;
}

export interface Settings {
  companyName: string;
  address: string;
  postalCode?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  documentPrefix: DocumentPrefix;
  documentNumbering?: DocumentNumberingSettings;
  iban?: string;
  vatId?: string;
  directorName?: string;
  notes: Note[];
  noteDefaultsByDoc: NoteDefaultsByDoc;
  defaultPaymentTerms?: string;
  disclaimer?: string;
  offerClauses?: LegacyOfferClause[];
}

export interface SettingsDocument extends Document, Settings {
  key: string;
}

const DocumentPrefixSchema = new Schema<DocumentPrefix>(
  {
    offer: { type: String, default: 'PON-' },
    invoice: { type: String, default: 'RAC-' },
    order: { type: String, default: 'NOR-' },
    deliveryNote: { type: String, default: 'DOB-' },
    workOrder: { type: String, default: 'DEL-' }
  },
  { _id: false }
);

const NoteSchema = new Schema<Note>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    category: {
      type: String,
      enum: ['payment', 'delivery', 'note', 'costs'],
      default: 'note'
    },
    sortOrder: { type: Number, default: 0 }
  },
  { _id: false }
);

const LegacyClauseSchema = new Schema<LegacyOfferClause>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    category: {
      type: String,
      enum: ['payment', 'delivery', 'note', 'costs'],
      default: 'note'
    },
    sortOrder: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false }
  },
  { _id: false }
);

const noteDefaultsShape: Record<DocumentTypeKey, { type: [StringConstructor]; default: string[] }> = {
  offer: { type: [String], default: [] },
  invoice: { type: [String], default: [] },
  workOrder: { type: [String], default: [] },
  materialOrder: { type: [String], default: [] },
  deliveryNote: { type: [String], default: [] },
  workOrderConfirmation: { type: [String], default: [] },
  creditNote: { type: [String], default: [] }
};

const DocumentNumberingConfigSchema = new Schema<DocumentNumberingConfig>(
  {
    pattern: { type: String, required: true, default: 'PONUDBA-{YYYY}-{SEQ:000}' },
    reset: { type: String, enum: ['never', 'yearly'], default: 'yearly' },
    yearOverride: { type: Number },
    seqOverride: { type: Number },
  },
  { _id: false }
);

const DocumentNumberingSchema = new Schema<DocumentNumberingSettings>(
  {
    offer: { type: DocumentNumberingConfigSchema, default: undefined },
    invoice: { type: DocumentNumberingConfigSchema, default: undefined },
    materialOrder: { type: DocumentNumberingConfigSchema, default: undefined },
    deliveryNote: { type: DocumentNumberingConfigSchema, default: undefined },
    workOrder: { type: DocumentNumberingConfigSchema, default: undefined },
    workOrderConfirmation: { type: DocumentNumberingConfigSchema, default: undefined },
    creditNote: { type: DocumentNumberingConfigSchema, default: undefined },
  },
  { _id: false }
);

const SettingsSchema = new Schema<SettingsDocument>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    companyName: { type: String, required: true, default: '' },
    address: { type: String, required: true, default: '' },
    postalCode: { type: String },
    city: { type: String },
    country: { type: String },
    email: { type: String },
    phone: { type: String },
    website: { type: String },
    logoUrl: { type: String },
    primaryColor: { type: String, default: '#0f62fe' },
    documentPrefix: { type: DocumentPrefixSchema, default: {} },
    documentNumbering: { type: DocumentNumberingSchema, default: undefined },
    iban: { type: String },
    vatId: { type: String },
    directorName: { type: String },
    notes: { type: [NoteSchema], default: [] },
    noteDefaultsByDoc: {
      type: new Schema<NoteDefaultsByDoc>(noteDefaultsShape, { _id: false }),
      default: () => ({
        offer: [],
        invoice: [],
        workOrder: [],
        materialOrder: [],
        deliveryNote: [],
        workOrderConfirmation: [],
        creditNote: []
      })
    },
    defaultPaymentTerms: { type: String },
    disclaimer: { type: String },
    offerClauses: { type: [LegacyClauseSchema], default: [] }
  },
  {
    timestamps: true,
    minimize: false
  }
);

export const SettingsModel = model<SettingsDocument>('Settings', SettingsSchema);

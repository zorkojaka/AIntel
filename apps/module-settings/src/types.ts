export type DocumentPrefixKey = 'offer' | 'invoice' | 'order' | 'deliveryNote' | 'workOrder';

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

export interface NoteDto {
  id: string;
  title: string;
  text: string;
  category: NoteCategory;
  sortOrder: number;
}

export type NotesDefaultsByDoc = Record<DocumentTypeKey, string[]>;

export interface SettingsDto {
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
  iban?: string;
  vatId?: string;
  directorName?: string;
  notes?: NoteDto[];
  noteDefaultsByDoc?: NotesDefaultsByDoc;
  defaultPaymentTerms?: string;
  disclaimer?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

export interface PdfCompanySettingsDto {
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

export type PdfFormatPreset = 'PREFIX-YYYY-SEQ' | 'PREFIX-YY-SEQ' | 'PREFIX-SEQ';
export type PdfResetPolicy = 'yearly' | 'never';

export interface PdfNumberingRuleDto {
  prefix: string;
  formatPreset: PdfFormatPreset;
  nextSequence: number;
  resetPolicy: PdfResetPolicy;
  padding: number;
}

export interface PdfDocumentSettingsDto {
  docType: 'OFFER';
  numberingRule: PdfNumberingRuleDto;
  defaultTexts: {
    paymentTerms?: string;
    disclaimer?: string;
  };
  templateHtml?: string | null;
}

export interface PdfPreviewProjectInfo {
  id: string;
  code: string;
  projectNumber?: number;
  title: string;
  customerName: string;
  customerAddress?: string;
  customerTaxId?: string;
}

export interface OfferPdfPreviewPayload {
  company: PdfCompanySettingsDto;
  document: {
    settings: PdfDocumentSettingsDto;
    generatedNumber: string;
    previewSequence: number;
  };
  offer: {
    _id: string;
    projectId: string;
    title: string;
    paymentTerms?: string | null;
    comment?: string | null;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalNet: number;
      totalVat: number;
      totalGross: number;
    }>;
    totalNet: number;
    totalVat: number;
    totalGross: number;
    totalGrossAfterDiscount?: number;
    totalNetAfterDiscount?: number;
  };
  project?: PdfPreviewProjectInfo | null;
  overrides?: {
    companyEmail?: string;
    companyPhone?: string;
    paymentTerms?: string;
    disclaimer?: string;
    documentNumberOverride?: string;
    documentNumberReason?: string;
  } | null;
}

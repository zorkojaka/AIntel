export type DocumentPrefixKey = 'offer' | 'invoice' | 'order' | 'deliveryNote' | 'workOrder';

export interface DocumentPrefix {
  offer: string;
  invoice: string;
  order: string;
  deliveryNote: string;
  workOrder: string;
}

export interface SettingsDto {
  companyName: string;
  address: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  documentPrefix: DocumentPrefix;
  defaultPaymentTerms?: string;
  disclaimer?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

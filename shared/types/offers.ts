export type OfferStatus = 'draft' | 'offered' | 'accepted' | 'rejected';

export interface OfferLineItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
}

export interface OfferVersion {
  _id: string;
  projectId: string;
  baseTitle: string;
  versionNumber: number;
  title: string;
  validUntil: string | null;
  paymentTerms: string | null;
  introText: string | null;
  items: OfferLineItem[];
  totalNet: number;
  totalVat22: number;
  totalVat95: number;
  totalVat: number;
  totalGross: number;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OfferVersionSummary {
  _id: string;
  baseTitle: string;
  versionNumber: number;
  title: string;
  status: OfferStatus;
  createdAt: string;
}

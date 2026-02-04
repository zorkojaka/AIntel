export type OfferStatus = 'draft' | 'offered' | 'accepted' | 'rejected' | 'cancelled';

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
  discountPercent?: number;
}

export interface OfferVersion {
  _id: string;
  projectId: string;
  baseTitle: string;
  versionNumber: number;
  title: string;
  documentNumber?: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  sentAt?: string | null;
  sentByUserId?: string | null;
  sentVia?: "email" | null;
  comment?: string | null;
  items: OfferLineItem[];
  totalNet: number;
  totalVat22: number;
  totalVat95: number;
  totalVat: number;
  totalGross: number;
  discountPercent: number;
  globalDiscountPercent?: number;
  discountAmount: number;
  totalNetAfterDiscount: number;
  totalGrossAfterDiscount: number;
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
  vatMode: 0 | 9.5 | 22;
  baseWithoutVat?: number;
  perItemDiscountAmount?: number;
  globalDiscountAmount?: number;
  baseAfterDiscount?: number;
  vatAmount?: number;
  totalWithVat?: number;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OfferVersionSummary {
  _id: string;
  baseTitle: string;
  versionNumber: number;
  title: string;
  documentNumber?: string | null;
  status: OfferStatus;
  createdAt: string;
  totalGross: number;
  totalGrossAfterDiscount?: number;
  totalWithVat?: number;
}

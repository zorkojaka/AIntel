export type ProductServiceLinkQuantityMode = 'same_as_product' | 'fixed';

export interface ProductServiceLinkServiceSummary {
  id: string;
  name: string;
  unitPrice?: number;
}

export interface ProductServiceLink {
  id: string;
  productId: string;
  serviceProductId: string;
  quantityMode: ProductServiceLinkQuantityMode;
  fixedQuantity?: number | null;
  isDefault: boolean;
  sortOrder?: number | null;
  note?: string;
  serviceProduct?: ProductServiceLinkServiceSummary;
}

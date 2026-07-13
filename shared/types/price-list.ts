export interface PriceListSearchItem {
  id: string;
  name: string;
  code?: string;
  slug?: string;
  slugs?: string[];
  categorySlugs?: string[];
  categories?: string[];
  isService?: boolean;
  externalSource?: string;
  imageUrl?: string;
  unit?: string;
  unitPrice: number;
  vatRate: number;
}

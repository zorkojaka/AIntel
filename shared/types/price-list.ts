export interface PriceListSearchItem {
  id: string;
  name: string;
  code?: string;
  unit?: string;
  unitPrice: number;
  vatRate: number;
}

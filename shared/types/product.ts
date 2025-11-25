export interface Product {
  id: string;
  name: string;
  categorySlugs: string[];
  price: number;
  description?: string;
  supplier?: string;
  isService: boolean;
}

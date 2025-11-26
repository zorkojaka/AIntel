export interface Category {
  id: string;
  name: string;
  slug: string;
  color?: string;
  order?: number;
}

export interface CategoryPayload {
  name: string;
  color?: string;
  order?: number;
}

export type ClientType = 'company' | 'individual';

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  vatNumber?: string;
  address?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  isComplete: boolean;
  street?: string;
  postalCode?: string;
  postalCity?: string;
}

export interface ClientFormPayload {
  name: string;
  type: ClientType;
  vatNumber?: string;
  address?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  tags: string[];
  notes?: string;
  street?: string;
  postalCode?: string;
  postalCity?: string;
}

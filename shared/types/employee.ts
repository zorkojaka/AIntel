export interface Employee {
  id: string;
  tenantId: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  roles?: string[];
  address?: string;
  employmentStartDate?: string | null;
  contractType?: string | null;
  shirtSize?: string | null;
  shoeSize?: number | null;
  notes?: string;
  hourRateWithoutVat: number;
  active: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

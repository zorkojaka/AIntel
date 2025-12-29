export interface Employee {
  id: string;
  tenantId: string;
  name: string;
  company?: string;
  hourRateWithoutVat: number;
  active: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

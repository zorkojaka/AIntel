export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  active: boolean;
  employeeId?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

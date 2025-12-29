import type { Employee as SharedEmployee } from '@aintel/shared/types/employee';

export type Employee = SharedEmployee;

export interface EmployeePayload {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  employmentStartDate?: string | null;
  contractType?: string | null;
  shirtSize?: string | null;
  shoeSize?: number | null;
  notes?: string;
  hourRateWithoutVat: number;
  active: boolean;
}

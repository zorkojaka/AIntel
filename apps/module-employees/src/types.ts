import type { Employee as SharedEmployee } from '@aintel/shared/types/employee';

export type Employee = SharedEmployee;

export interface EmployeePayload {
  name: string;
  company?: string;
  hourRateWithoutVat: number;
  active: boolean;
}

import { Request, Response } from 'express';
import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from '../services/employee.service';

export async function getEmployees(_req: Request, res: Response) {
  const employees = await listEmployees();
  return res.success(employees);
}

export async function postEmployee(req: Request, res: Response) {
  if (!req.body?.name) {
    return res.fail('Ime zaposlenega je obvezno.', 400);
  }
  const employee = await createEmployee(req.body);
  return res.success(employee, 201);
}

export async function patchEmployee(req: Request, res: Response) {
  const updated = await updateEmployee(req.params.id, req.body);
  if (!updated) {
    return res.fail('Zaposleni ni najden.', 404);
  }
  return res.success(updated);
}

export async function removeEmployee(req: Request, res: Response) {
  const deleted = await deleteEmployee(req.params.id);
  if (!deleted) {
    return res.fail('Zaposleni ni najden.', 404);
  }
  return res.success({ success: true });
}

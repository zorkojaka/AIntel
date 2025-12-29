import { Request, Response } from 'express';
import { resolveActorId, resolveTenantId } from '../../../utils/tenant';
import {
  assertCan,
} from '../services/authorization';
import {
  createEmployee,
  hardDeleteEmployee,
  listEmployees,
  softDeleteEmployee,
  updateEmployee,
} from '../services/employee.service';
import { getUserByEmployeeId } from '../../users/services/user.service';

const contractTypes = ['zaposlitvena', 'podjemna', 's.p.', 'student', 'zunanji'] as const;
const shirtSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;

function parseBooleanFlag(value?: string | string[]) {
  if (Array.isArray(value)) return value.some((item) => ['1', 'true', 'yes'].includes(String(item).toLowerCase()));
  if (value === undefined) return false;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function isValidEmail(value: unknown) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return trimmed.includes('@');
}

function isValidDate(value: unknown) {
  if (value === null || value === undefined || value === '') return true;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
}

function isValidNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return true;
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

export async function getEmployees(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }
  await assertCan('list', (req as any).user, { tenantId });

  const includeDeleted = parseBooleanFlag(req.query.includeDeleted as string | undefined);
  const employees = await listEmployees(tenantId, includeDeleted);
  return res.success(employees);
}

export async function postEmployee(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  if (!req.body?.name) {
    return res.fail('Ime zaposlenega je obvezno.', 400);
  }

  if (req.body.hourRateWithoutVat !== undefined && Number(req.body.hourRateWithoutVat) < 0) {
    return res.fail('Urna postavka mora biti nenegativna.', 400);
  }
  if (!isValidEmail(req.body.email)) {
    return res.fail('Email ni veljaven.', 400);
  }
  if (!isValidDate(req.body.employmentStartDate)) {
    return res.fail('Datum zaposlitve ni veljaven.', 400);
  }
  if (req.body.contractType && !contractTypes.includes(req.body.contractType)) {
    return res.fail('Vrsta pogodbe ni veljavna.', 400);
  }
  if (req.body.shirtSize && !shirtSizes.includes(req.body.shirtSize)) {
    return res.fail('Velikost majice ni veljavna.', 400);
  }
  if (!isValidNumber(req.body.shoeSize)) {
    return res.fail('Stevilka cevljev ni veljavna.', 400);
  }

  await assertCan('create', (req as any).user, { tenantId });
  const employee = await createEmployee(tenantId, req.body);
  return res.success(employee, 201);
}

export async function patchEmployee(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  if (req.body.hourRateWithoutVat !== undefined && Number(req.body.hourRateWithoutVat) < 0) {
    return res.fail('Urna postavka mora biti nenegativna.', 400);
  }
  if (!isValidEmail(req.body.email)) {
    return res.fail('Email ni veljaven.', 400);
  }
  if (!isValidDate(req.body.employmentStartDate)) {
    return res.fail('Datum zaposlitve ni veljaven.', 400);
  }
  if (req.body.contractType && !contractTypes.includes(req.body.contractType)) {
    return res.fail('Vrsta pogodbe ni veljavna.', 400);
  }
  if (req.body.shirtSize && !shirtSizes.includes(req.body.shirtSize)) {
    return res.fail('Velikost majice ni veljavna.', 400);
  }
  if (!isValidNumber(req.body.shoeSize)) {
    return res.fail('Stevilka cevljev ni veljavna.', 400);
  }

  await assertCan('update', (req as any).user, { tenantId, employeeId: req.params.id });

  try {
    const updated = await updateEmployee(req.params.id, tenantId, req.body);
    if (!updated) {
      return res.fail('Zaposleni ni najden ali je odstranjen.', 404);
    }
    return res.success(updated);
  } catch (error: any) {
    if (error?.message === 'NEGATIVE_RATE') {
      return res.fail('Urna postavka mora biti nenegativna.', 400);
    }
    throw error;
  }
}

export async function removeEmployee(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  await assertCan('delete', (req as any).user, { tenantId, employeeId: req.params.id });

  const deletedBy = resolveActorId(req);
  const hardDelete = parseBooleanFlag(req.query.hard as string | undefined);

  const deleted = hardDelete
    ? await hardDeleteEmployee(req.params.id, tenantId)
    : await softDeleteEmployee(req.params.id, tenantId, deletedBy);

  if (!deleted) {
    return res.fail('Zaposleni ni najden.', 404);
  }
  return res.success({ success: true });
}

export async function getEmployeeUser(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  await assertCan('read', (req as any).user, { tenantId, employeeId: req.params.id });

  const user = await getUserByEmployeeId(tenantId, req.params.id);
  return res.success(user ?? null);
}

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

function parseBooleanFlag(value?: string | string[]) {
  if (Array.isArray(value)) return value.some((item) => ['1', 'true', 'yes'].includes(String(item).toLowerCase()));
  if (value === undefined) return false;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
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

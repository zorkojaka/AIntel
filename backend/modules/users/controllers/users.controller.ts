import { Request, Response } from 'express';
import { resolveActorId, resolveTenantId } from '../../../utils/tenant';
import { assertCan, roleKeys } from '../services/authorization';
import {
  createUser,
  hardDeleteUser,
  listUsers,
  softDeleteUser,
  updateUser,
} from '../services/user.service';

function parseBooleanFlag(value?: string | string[]) {
  if (Array.isArray(value)) return value.some((item) => ['1', 'true', 'yes'].includes(String(item).toLowerCase()));
  if (value === undefined) return false;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeRoles(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const roles = value.map((role) => String(role));
  return roles;
}

export async function getUsers(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }
  await assertCan('list', (req as any).user, { tenantId });

  const includeDeleted = parseBooleanFlag(req.query.includeDeleted as string | undefined);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const users = await listUsers(tenantId, includeDeleted, search);
  return res.success(users);
}

export async function postUser(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const email = normalizeEmail(req.body?.email);
  const name = normalizeName(req.body?.name);
  if (!email) {
    return res.fail('Email je obvezen.', 400);
  }
  if (!name) {
    return res.fail('Ime uporabnika je obvezno.', 400);
  }

  const roles = normalizeRoles(req.body?.roles);
  if (roles && roles.some((role) => !roleKeys.includes(role as any))) {
    return res.fail('Neveljavna vloga.', 400);
  }

  if (req.body?.active !== undefined && typeof req.body.active !== 'boolean') {
    return res.fail('Aktivnost mora biti bool.', 400);
  }

  await assertCan('create', (req as any).user, { tenantId });

  try {
    const user = await createUser(tenantId, {
      email,
      name,
      roles,
      active: req.body?.active,
      employeeId: req.body?.employeeId ?? null,
    } as any);
    return res.success(user, 201);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.fail('Email je ze v uporabi.', 409);
    }
    throw error;
  }
}

export async function patchUser(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const update: any = {};
  if (req.body?.email !== undefined) {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.fail('Email je obvezen.', 400);
    }
    update.email = email;
  }
  if (req.body?.name !== undefined) {
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.fail('Ime uporabnika je obvezno.', 400);
    }
    update.name = name;
  }
  if (req.body?.roles !== undefined) {
    const roles = normalizeRoles(req.body?.roles);
    if (!roles) {
      return res.fail('Vloge morajo biti seznam.', 400);
    }
    if (roles.some((role) => !roleKeys.includes(role as any))) {
      return res.fail('Neveljavna vloga.', 400);
    }
    update.roles = roles;
  }
  if (req.body?.active !== undefined) {
    if (typeof req.body.active !== 'boolean') {
      return res.fail('Aktivnost mora biti bool.', 400);
    }
    update.active = req.body.active;
  }
  if (req.body?.employeeId !== undefined) {
    update.employeeId = req.body.employeeId;
  }

  await assertCan('update', (req as any).user, { tenantId, userId: req.params.id });

  try {
    const updated = await updateUser(req.params.id, tenantId, update);
    if (!updated) {
      return res.fail('Uporabnik ni najden ali je odstranjen.', 404);
    }
    return res.success(updated);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.fail('Email je ze v uporabi.', 409);
    }
    throw error;
  }
}

export async function removeUser(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  await assertCan('delete', (req as any).user, { tenantId, userId: req.params.id });

  const deletedBy = resolveActorId(req);
  const hardDelete = parseBooleanFlag(req.query.hard as string | undefined);

  const deleted = hardDelete
    ? await hardDeleteUser(req.params.id, tenantId)
    : await softDeleteUser(req.params.id, tenantId, deletedBy);

  if (!deleted) {
    return res.fail('Uporabnik ni najden.', 404);
  }
  return res.success({ success: true });
}

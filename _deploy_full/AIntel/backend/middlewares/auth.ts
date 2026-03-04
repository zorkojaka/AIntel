import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { UserModel } from '../modules/users/schemas/user';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { ROLE_ADMIN, toCanonicalRole } from '../utils/roles';

const JWT_COOKIE_NAME = 'aintel_session';
const DEFAULT_JWT_SECRET = 'aintel_dev_secret';

type SessionPayload = {
  userId: string;
  tenantId: string;
};

function getJwtSecret() {
  return process.env.AINTEL_JWT_SECRET || DEFAULT_JWT_SECRET;
}

function normalizeRoles(roles: unknown) {
  if (!Array.isArray(roles)) return [];
  const normalized = roles
    .map((role) => (typeof role === 'string' ? toCanonicalRole(role) : null))
    .filter((role): role is string => !!role);
  return [...new Set(normalized)];
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[JWT_COOKIE_NAME];
  if (!token) {
    return res.fail('Neprijavljen uporabnik.', 401);
  }

  let payload: SessionPayload | null = null;
  try {
    payload = jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return res.fail('Neveljavna seja.', 401);
  }

  const user = await UserModel.findOne({
    _id: payload.userId,
    tenantId: payload.tenantId,
    deletedAt: null,
  });
  if (!user) {
    return res.fail('Uporabnik ni najden.', 401);
  }

  const status = user.status ?? (user.active ? 'ACTIVE' : 'DISABLED');
  if (status !== 'ACTIVE') {
    return res.fail('Uporabnik ni aktiven.', 403);
  }

  const employee = user.employeeId
    ? await EmployeeModel.findOne({ _id: user.employeeId, tenantId: payload.tenantId, deletedAt: null })
    : null;

  const roles = normalizeRoles(employee?.roles ?? user.roles ?? []);

  (req as any).context = {
    tenantId: payload.tenantId,
    actorUserId: String(user._id),
    actorEmployeeId: employee ? String(employee._id) : null,
    roles,
  };

  (req as any).user = {
    id: String(user._id),
    tenantId: payload.tenantId,
    roles,
  };

  (req as any).authUser = user;
  (req as any).authEmployee = employee;

  return next();
}

export function requireRoles(requiredRoles: string[]) {
  const required = requiredRoles
    .map((role) => (typeof role === 'string' ? toCanonicalRole(role) : null))
    .filter((role): role is string => !!role);
  return (req: Request, res: Response, next: NextFunction) => {
    const roles = Array.isArray((req as any)?.context?.roles) ? (req as any).context.roles : [];
    if (roles.includes(ROLE_ADMIN)) {
      return next();
    }
    const hasRole = required.length === 0 || roles.some((role: string) => required.includes(role));
    if (!hasRole) {
      return res.fail('Ni dostopa.', 403);
    }
    return next();
  };
}

export const authCookieName = JWT_COOKIE_NAME;

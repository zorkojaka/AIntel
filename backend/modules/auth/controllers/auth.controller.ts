import { Request, Response } from 'express';
import crypto from 'node:crypto';

import { UserModel } from '../../users/schemas/user';
import { EmployeeModel } from '../../employees/schemas/employee';
import { EmployeeProfileModel } from '../../employee-profiles/schemas/employee-profile';
import { resolveTenantId } from '../../../utils/tenant';
import { normalizeRoleList, toCanonicalRole } from '../../../utils/roles';
import {
  clearSessionCookie,
  generateTokenPair,
  hashPassword,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
} from '../services/auth.service';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_EXPIRY_MS = 60 * 60 * 1000;

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isEnvEnabled(value?: string) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function buildAppUrl(req: Request) {
  const origin = req.headers.origin || req.headers.referer;
  if (origin && typeof origin === 'string') {
    try {
      return new URL(origin).origin;
    } catch {
      return origin;
    }
  }
  return process.env.AINTEL_APP_URL || 'http://localhost:5173';
}

export async function login(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.fail('Email in geslo sta obvezna.', 400);
  }

  const user = await UserModel.findOne({ tenantId, email, deletedAt: null });
  if (!user || !user.passwordHash) {
    return res.fail('Napačni podatki.', 401);
  }

  const status = user.status ?? (user.active ? 'ACTIVE' : 'DISABLED');
  if (status !== 'ACTIVE') {
    return res.fail('Uporabnik ni aktiven.', 403);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.fail('Napačni podatki.', 401);
  }

  const token = signSessionToken({ userId: String(user._id), tenantId });
  setSessionCookie(res, token);
  return res.success({ success: true });
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  return res.success({ success: true });
}

export async function me(req: Request, res: Response) {
  const user = (req as any).authUser;
  if (!user) {
    return res.fail('Neprijavljen uporabnik.', 401);
  }
  const employee = (req as any).authEmployee;
  const profile = employee
    ? await EmployeeProfileModel.findOne({ tenantId: user.tenantId, employeeId: employee._id }).lean()
    : null;

  const employeeRoles = employee?.roles ? employee.roles : [];
  const normalizedRoles = Array.isArray(employeeRoles)
    ? employeeRoles
        .map((role) => (typeof role === 'string' ? toCanonicalRole(role) : null))
        .filter((role): role is string => !!role)
    : [];

  return res.success({
    tenantId: user.tenantId,
    user: {
      id: String(user._id),
      email: user.email,
      status: user.status ?? (user.active ? 'ACTIVE' : 'DISABLED'),
    },
    employee: employee
      ? {
          id: String(employee._id),
          name: employee.name,
          roles: normalizedRoles,
        }
      : null,
    profile: profile
      ? {
          id: String(profile._id),
          employeeId: String(profile.employeeId),
          primaryRole: profile.primaryRole,
          profitSharePercent: profile.profitSharePercent,
          hourlyRate: profile.hourlyRate ?? null,
          exceptions: profile.exceptions ?? {},
        }
      : null,
  });
}

export async function invite(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.fail('Email je obvezen.', 400);
  }

  const roles = req.body?.roles !== undefined ? normalizeRoleList(req.body?.roles) : null;
  if (roles === null) {
    return res.fail('Vloge niso veljavne.', 400);
  }

  let employeeId = typeof req.body?.employeeId === 'string' ? req.body.employeeId : null;
  const createEmployee = !!req.body?.createEmployee;
  const employeeName = typeof req.body?.employeeName === 'string' ? req.body.employeeName.trim() : '';

  if (!employeeId && createEmployee) {
    const createdEmployee = await EmployeeModel.create({
      tenantId,
      name: employeeName || email,
      roles: roles ?? [],
    });
    employeeId = String(createdEmployee._id);
  }

  if (employeeId) {
    const employee = await EmployeeModel.findOne({ _id: employeeId, tenantId, deletedAt: null });
    if (!employee) {
      return res.fail('Zaposleni ni najden.', 404);
    }
    if (roles) {
      employee.roles = roles;
      await employee.save();
    }
  }

  const existing = await UserModel.findOne({ tenantId, email, deletedAt: null });
  if (existing) {
    return res.fail('Uporabnik že obstaja.', 409);
  }

  const { token, tokenHash, expiresAt } = generateTokenPair(INVITE_EXPIRY_MS);

  const user = await UserModel.create({
    tenantId,
    email,
    name: employeeName || email,
    status: 'INVITED',
    active: false,
    employeeId: employeeId ?? null,
    inviteTokenHash: tokenHash,
    inviteTokenExpiresAt: expiresAt,
  });

  const inviteUrl = `${buildAppUrl(req)}/accept-invite?token=${token}`;

  return res.success({
    userId: String(user._id),
    inviteUrl,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function acceptInvite(req: Request, res: Response) {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!token || !password) {
    return res.fail('Token in geslo sta obvezna.', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await UserModel.findOne({
    inviteTokenHash: tokenHash,
    inviteTokenExpiresAt: { $gt: new Date() },
    status: 'INVITED',
  });
  if (!user) {
    return res.fail('Povabilo ni veljavno.', 400);
  }

  user.passwordHash = await hashPassword(password);
  user.status = 'ACTIVE';
  user.active = true;
  user.inviteTokenHash = null;
  user.inviteTokenExpiresAt = null;
  await user.save();

  const tokenJwt = signSessionToken({ userId: String(user._id), tenantId: user.tenantId });
  setSessionCookie(res, tokenJwt);

  return res.success({ success: true });
}

export async function requestPasswordReset(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.success({ success: true });
  }

  const effectiveTenantId = tenantId || 'inteligent';
  let user = await UserModel.findOne({ tenantId: effectiveTenantId, email, deletedAt: null });
  if (!user) {
    if (!isEnvEnabled(process.env.AINTEL_ALLOW_RESET_ON_UNKNOWN_EMAIL)) {
      return res.success({ success: true });
    }
    user = await UserModel.create({
      tenantId: effectiveTenantId,
      email,
      name: email,
      roles: [],
      status: 'ACTIVE',
      active: true,
      passwordHash: null,
      employeeId: null,
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      deletedAt: null,
      deletedBy: null,
    });
  }

  const status = user.status ?? (user.active ? 'ACTIVE' : 'DISABLED');
  if (status === 'DISABLED') {
    return res.success({ success: true });
  }

  const { token, tokenHash, expiresAt } = generateTokenPair(RESET_EXPIRY_MS);
  user.resetTokenHash = tokenHash;
  user.resetTokenExpiresAt = expiresAt;
  await user.save();

  const payload: Record<string, any> = { success: true };
  const shouldReturnLink = process.env.NODE_ENV !== 'production' || process.env.AINTEL_RETURN_RESET_LINK === 'true';
  if (shouldReturnLink) {
    payload.resetUrl = `${buildAppUrl(req)}/reset-password?token=${token}`;
    payload.expiresAt = expiresAt.toISOString();
  }

  return res.success(payload);
}

export async function resetPassword(req: Request, res: Response) {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!token || !newPassword) {
    return res.fail('Token in novo geslo sta obvezna.', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await UserModel.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    return res.fail('Povezava ni veljavna.', 400);
  }

  user.passwordHash = await hashPassword(newPassword);
  user.status = 'ACTIVE';
  user.active = true;
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  await user.save();

  const tokenJwt = signSessionToken({ userId: String(user._id), tenantId: user.tenantId });
  setSessionCookie(res, tokenJwt);

  return res.success({ success: true });
}

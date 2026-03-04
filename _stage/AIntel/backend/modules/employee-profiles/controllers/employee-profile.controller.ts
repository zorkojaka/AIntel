import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { resolveTenantId } from '../../../utils/tenant';
import { createProfile, getProfileByEmployeeId, updateProfile } from '../services/employee-profile.service';

function isValidNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return true;
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

export async function getEmployeeProfiles(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : '';
  if (!employeeId) {
    return res.fail('EmployeeId je obvezen.', 400);
  }
  if (!mongoose.isValidObjectId(employeeId)) {
    return res.fail('EmployeeId ni veljaven.', 400);
  }

  const profile = await getProfileByEmployeeId(tenantId, employeeId);
  return res.success(profile);
}

export async function postEmployeeProfile(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const { employeeId, primaryRole, profitSharePercent, hourlyRate, exceptions } = req.body ?? {};
  if (!employeeId || !mongoose.isValidObjectId(employeeId)) {
    return res.fail('EmployeeId je obvezen.', 400);
  }
  if (!primaryRole) {
    return res.fail('Primarna vloga je obvezna.', 400);
  }
  if (!isValidNumber(profitSharePercent)) {
    return res.fail('Profit share mora biti številka.', 400);
  }
  if (!isValidNumber(hourlyRate)) {
    return res.fail('Urna postavka mora biti številka.', 400);
  }

  try {
    const created = await createProfile(tenantId, {
      employeeId,
      primaryRole,
      profitSharePercent: Number(profitSharePercent),
      hourlyRate: hourlyRate === null || hourlyRate === undefined || hourlyRate === '' ? null : Number(hourlyRate),
      exceptions: exceptions ?? {},
    } as any);
    return res.success(created, 201);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.fail('Profil za zaposlenega že obstaja.', 409);
    }
    throw error;
  }
}

export async function patchEmployeeProfile(req: Request, res: Response) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return res.fail('TenantId ni podan.', 400);
  }

  const { primaryRole, profitSharePercent, hourlyRate, exceptions } = req.body ?? {};
  if (!primaryRole) {
    return res.fail('Primarna vloga je obvezna.', 400);
  }
  if (!isValidNumber(profitSharePercent)) {
    return res.fail('Profit share mora biti številka.', 400);
  }
  if (!isValidNumber(hourlyRate)) {
    return res.fail('Urna postavka mora biti številka.', 400);
  }

  const updated = await updateProfile(req.params.id, tenantId, {
    primaryRole,
    profitSharePercent: Number(profitSharePercent),
    hourlyRate: hourlyRate === null || hourlyRate === undefined || hourlyRate === '' ? null : Number(hourlyRate),
    exceptions: exceptions ?? {},
  } as any);

  if (!updated) {
    return res.fail('Profil ni najden.', 404);
  }
  return res.success(updated);
}

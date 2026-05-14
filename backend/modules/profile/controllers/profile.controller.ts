import type { Request, Response } from 'express';

import { getMyEarnings, getMyProjects, getMyServiceRates, getProfileOverview } from '../services/profile.service';

function getProfileContext(req: Request) {
  const context = (req as any).context ?? {};
  return {
    tenantId: String(context.tenantId ?? (req as any).user?.tenantId ?? ''),
    userId: String((req as any).user?.id ?? ''),
    employeeId: context.actorEmployeeId ? String(context.actorEmployeeId) : null,
  };
}

function normalizeProjectFilter(value: unknown) {
  return value === 'upcoming' || value === 'completed' ? value : 'all';
}

function normalizeYear(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
}

export async function me(req: Request, res: Response) {
  return res.success(await getProfileOverview(getProfileContext(req)));
}

export async function myProjects(req: Request, res: Response) {
  return res.success(await getMyProjects(getProfileContext(req), normalizeProjectFilter(req.query.filter)));
}

export async function myEarnings(req: Request, res: Response) {
  return res.success(await getMyEarnings(getProfileContext(req), normalizeYear(req.query.year)));
}

export async function myServiceRates(req: Request, res: Response) {
  return res.success(await getMyServiceRates(getProfileContext(req)));
}

import { Request, Response } from 'express';
import {
  getEmployeesSummary,
  getIssuedInvoices,
  getMonthlySummary,
  getProjectsSummary,
} from '../services/finance-analytics.service';
import { resolveTenantId } from '../../../utils/tenant';

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function buildRange(req: Request) {
  return { from: parseDate(req.query.from as string), to: parseDate(req.query.to as string) };
}

export async function projectsSummary(req: Request, res: Response) {
  const data = await getProjectsSummary(buildRange(req), resolveTenantId(req));
  return res.success(data);
}

export async function monthlySummary(req: Request, res: Response) {
  const data = await getMonthlySummary(buildRange(req), resolveTenantId(req));
  return res.success(data);
}

export async function employeesSummary(req: Request, res: Response) {
  const data = await getEmployeesSummary(buildRange(req), resolveTenantId(req));
  return res.success(data);
}

export async function invoicesSummary(req: Request, res: Response) {
  const data = await getIssuedInvoices(buildRange(req));
  return res.success(data);
}

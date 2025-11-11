import { Request, Response } from 'express';
import { getDefaultDashboardStats, DashboardStats } from '../schemas/dashboardStats';

export function getStats(_req: Request, res: Response) {
  const metrics: DashboardStats = getDefaultDashboardStats();
  res.success(metrics);
}

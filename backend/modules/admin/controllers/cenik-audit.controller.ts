import { Request, Response } from 'express';

import { auditProducts } from '../../cenik/audit/auditProducts';

export async function auditCenik(req: Request, res: Response) {
  try {
    const report = await auditProducts();
    return res.success(report);
  } catch (error) {
    console.error('Cenik audit failed:', error);
    return res.fail('Audit ni uspel.', 500);
  }
}

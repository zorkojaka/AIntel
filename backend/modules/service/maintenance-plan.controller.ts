import type { Request, Response } from 'express';

import {
  createMaintenancePlan,
  createPlanFromProject,
  getMaintenancePlan,
  listMaintenancePlans,
  updateMaintenancePlan,
  scanDueMaintenance,
  MaintenancePlanError,
} from './maintenance-plan.service';
import type { ActorContext } from './service-ticket.service';

function actorContext(req: Request): ActorContext {
  const context = (req as any).context ?? {};
  return {
    tenantId: context.tenantId ?? 'inteligent',
    actorUserId: context.actorUserId ?? '',
    actorEmployeeId: context.actorEmployeeId ?? null,
    roles: Array.isArray(context.roles) ? context.roles : [],
  };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof MaintenancePlanError) return res.fail(error.message, error.statusCode);
  (res.req as any)?.log?.error?.({ err: error }, fallback);
  return res.fail(fallback, 500);
}

export async function getMaintenancePlans(req: Request, res: Response) {
  try {
    const plans = await listMaintenancePlans(actorContext(req), {
      status: req.query.status,
      clientId: req.query.clientId,
      projectId: req.query.projectId,
      dueBefore: req.query.dueBefore,
    });
    return res.success(plans);
  } catch (error) {
    return handleError(res, error, 'Načrtov vzdrževanja ni mogoče prebrati.');
  }
}

export async function getOneMaintenancePlan(req: Request, res: Response) {
  try {
    return res.success(await getMaintenancePlan(actorContext(req), req.params.id));
  } catch (error) {
    return handleError(res, error, 'Načrta vzdrževanja ni mogoče prebrati.');
  }
}

export async function postMaintenancePlan(req: Request, res: Response) {
  try {
    return res.success(await createMaintenancePlan(actorContext(req), req.body ?? {}), 201);
  } catch (error) {
    return handleError(res, error, 'Načrta vzdrževanja ni mogoče ustvariti.');
  }
}

export async function postMaintenancePlanFromProject(req: Request, res: Response) {
  try {
    const plan = await createPlanFromProject(actorContext(req), req.body?.projectId, {
      intervalMonths: req.body?.intervalMonths,
    });
    return res.success(plan, 201);
  } catch (error) {
    return handleError(res, error, 'Načrta iz projekta ni mogoče izpeljati.');
  }
}

export async function patchMaintenancePlan(req: Request, res: Response) {
  try {
    return res.success(await updateMaintenancePlan(actorContext(req), req.params.id, req.body ?? {}));
  } catch (error) {
    return handleError(res, error, 'Načrta vzdrževanja ni mogoče posodobiti.');
  }
}

// Ročni sprožilec letnega scana (ADMIN). Pravilo maintenance.due mora biti vklopljeno.
export async function runDueMaintenance(req: Request, res: Response) {
  try {
    const ctx = actorContext(req);
    return res.success(await scanDueMaintenance(new Date(), ctx.tenantId));
  } catch (error) {
    return handleError(res, error, 'Scan vzdrževanja ni uspel.');
  }
}

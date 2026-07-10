import type { Request, Response } from 'express';

import {
  createServiceTicket,
  getServiceTicket,
  listServiceTickets,
  updateServiceTicket,
  ServiceTicketError,
  type ActorContext,
} from './service-ticket.service';

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
  if (error instanceof ServiceTicketError) return res.fail(error.message, error.statusCode);
  (res.req as any)?.log?.error?.({ err: error }, fallback);
  return res.fail(fallback, 500);
}

export async function getServiceTickets(req: Request, res: Response) {
  try {
    const tickets = await listServiceTickets(actorContext(req), {
      status: req.query.status,
      clientId: req.query.clientId,
      projectId: req.query.projectId,
      source: req.query.source,
    });
    return res.success(tickets);
  } catch (error) {
    return handleError(res, error, 'Servisnih zahtevkov ni mogoče prebrati.');
  }
}

export async function getOneServiceTicket(req: Request, res: Response) {
  try {
    return res.success(await getServiceTicket(actorContext(req), req.params.id));
  } catch (error) {
    return handleError(res, error, 'Servisnega zahtevka ni mogoče prebrati.');
  }
}

export async function postServiceTicket(req: Request, res: Response) {
  try {
    const ticket = await createServiceTicket(actorContext(req), req.body ?? {});
    return res.success(ticket, 201);
  } catch (error) {
    return handleError(res, error, 'Servisnega zahtevka ni mogoče ustvariti.');
  }
}

export async function patchServiceTicket(req: Request, res: Response) {
  try {
    const ticket = await updateServiceTicket(actorContext(req), req.params.id, req.body ?? {});
    return res.success(ticket);
  } catch (error) {
    return handleError(res, error, 'Servisnega zahtevka ni mogoče posodobiti.');
  }
}

import type { Request } from 'express';

export function getActor(req: Request) {
  const context = (req as any)?.context ?? null;
  if (!context) {
    return null;
  }
  return {
    tenantId: context.tenantId ?? null,
    actorUserId: context.actorUserId ?? null,
    actorEmployeeId: context.actorEmployeeId ?? null,
    roles: Array.isArray(context.roles) ? context.roles : [],
  };
}

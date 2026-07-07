import { Request } from 'express';

export function resolveTenantId(req: Request): string | null {
  const contextTenant = (req as any)?.context?.tenantId as string | undefined;
  if (contextTenant) return contextTenant;

  const userTenant = (req as any)?.user?.tenantId as string | undefined;
  if (userTenant) return userTenant;

  const requestTenant = (req as any)?.tenantId as string | undefined;
  if (requestTenant) return requestTenant;

  // MVP single-tenant default.
  return 'inteligent';
}

export function resolveActorId(req: Request): string | null {
  const contextActor = (req as any)?.context?.actorUserId as string | undefined;
  if (contextActor) return contextActor;

  const userId = (req as any)?.user?.id as string | undefined;
  if (userId) return userId;

  return null;
}

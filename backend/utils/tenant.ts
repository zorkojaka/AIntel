import { Request } from 'express';

export function resolveTenantId(req: Request): string | null {
  const headerTenant = (req.headers['x-tenant-id'] as string | undefined)?.trim();
  if (headerTenant) return headerTenant;

  const userTenant = (req as any)?.user?.tenantId as string | undefined;
  if (userTenant) return userTenant;

  const requestTenant = (req as any)?.tenantId as string | undefined;
  if (requestTenant) return requestTenant;

  // MVP single-tenant default.
  return 'inteligent';
}

export function resolveActorId(req: Request): string | null {
  const headerActor = (req.headers['x-user-id'] as string | undefined)?.trim();
  if (headerActor) return headerActor;

  const userId = (req as any)?.user?.id as string | undefined;
  if (userId) return userId;

  return null;
}

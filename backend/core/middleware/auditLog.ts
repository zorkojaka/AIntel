import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_FIELD_PATTERN = /(password|token|secret|key|cookie|authorization|smtp|dsn)/i;

function cleanPath(path: string) {
  return path.split('?')[0].replace(/\/+/g, '/');
}

function bodyKeys(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body as Record<string, unknown>)
    .filter((key) => !SENSITIVE_FIELD_PATTERN.test(key))
    .slice(0, 40)
    .sort();
}

function resolveEntity(pathname: string) {
  const parts = cleanPath(pathname).split('/').filter(Boolean);
  const apiIndex = parts[0] === 'api' ? 1 : 0;
  const moduleName = parts[apiIndex] ?? null;
  const entityId = parts[apiIndex + 1] && !parts[apiIndex + 1].includes(':') ? parts[apiIndex + 1] : null;
  return { module: moduleName, entityId };
}

export function buildAuditMutationEvent(req: Request, res: Response) {
  const context = (req as any).context ?? {};
  const pathname = cleanPath(req.originalUrl || req.url || '');
  const entity = resolveEntity(pathname);
  return {
    scope: 'audit.mutation',
    tenantId: context.tenantId ?? null,
    actorUserId: context.actorUserId ?? null,
    actorEmployeeId: context.actorEmployeeId ?? null,
    roles: Array.isArray(context.roles) ? context.roles : [],
    method: req.method,
    route: pathname,
    statusCode: res.statusCode,
    entity,
    changedFields: req.method === 'DELETE' ? [] : bodyKeys(req.body),
    requestId: (req as any).id ?? req.headers['x-request-id'] ?? null,
  };
}

export function auditMutationLog(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  res.once('finish', () => {
    const event = buildAuditMutationEvent(req, res);
    const log = (req as any).log ?? logger;
    const message = '[audit] mutating route';
    if (res.statusCode >= 500) {
      log.error(event, message);
    } else if (res.statusCode >= 400) {
      log.warn(event, message);
    } else {
      log.info(event, message);
    }
  });

  return next();
}

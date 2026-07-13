// AIN-P2-11: HTTP sloj config store. Branje = auth (odvisni moduli), pisanje = ADMIN
// (mount v routes.ts). Napake sheme → 400, neznan prostor → 404.
import type { Request, Response } from 'express';

import { getConfig, listConfig, setConfig, patchConfig } from './config-store.service';
import { ConfigNamespaceNotFoundError } from './config-registry';
import { ConfigValidationError } from './config-validator';

function tenantOf(req: Request): string {
  return (req as any).context?.tenantId ?? 'inteligent';
}

function updatedByOf(req: Request): string | null {
  const ctx = (req as any).context ?? {};
  return ctx.actorEmployeeId ?? ctx.actorUserId ?? null;
}

function handle(res: Response, error: unknown, fallback: string) {
  if (error instanceof ConfigNamespaceNotFoundError) return res.fail(error.message, 404);
  if (error instanceof ConfigValidationError) return res.fail(error.message, 400);
  (res.req as any)?.log?.error?.({ err: error }, fallback);
  return res.fail(fallback, 500);
}

export async function getAllConfig(req: Request, res: Response) {
  try {
    return res.success(await listConfig(tenantOf(req)));
  } catch (error) {
    return handle(res, error, 'Konfiguracije ni mogoče prebrati.');
  }
}

export async function getOneConfig(req: Request, res: Response) {
  try {
    return res.success(await getConfig(String(req.params.namespace), tenantOf(req)));
  } catch (error) {
    return handle(res, error, 'Konfiguracije ni mogoče prebrati.');
  }
}

export async function putOneConfig(req: Request, res: Response) {
  try {
    const value = await setConfig(String(req.params.namespace), req.body, {
      tenantId: tenantOf(req),
      updatedBy: updatedByOf(req),
    });
    return res.success(value);
  } catch (error) {
    return handle(res, error, 'Konfiguracije ni mogoče shraniti.');
  }
}

export async function patchOneConfig(req: Request, res: Response) {
  try {
    const value = await patchConfig(String(req.params.namespace), req.body ?? {}, {
      tenantId: tenantOf(req),
      updatedBy: updatedByOf(req),
    });
    return res.success(value);
  } catch (error) {
    return handle(res, error, 'Konfiguracije ni mogoče shraniti.');
  }
}

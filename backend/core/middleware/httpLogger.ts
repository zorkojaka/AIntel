import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pinoHttp from 'pino-http';

import { logger } from '../logger';

// Emits one JSON line per completed request with a request id, latency, and —
// once requireAuth has populated req.context — the tenant/user/route. The
// request id is echoed back on the `x-request-id` response header so it can be
// correlated across the frontend and any downstream error tracker (AIN-P1-02).
export const httpLogger = pinoHttp({
  logger,
  genReqId(req: IncomingMessage, res: ServerResponse) {
    const header = req.headers['x-request-id'];
    const incoming = Array.isArray(header) ? header[0] : header;
    const id = incoming && incoming.trim() ? incoming.trim() : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customProps(req) {
    const context = (req as any).context ?? {};
    return {
      tenantId: context.tenantId ?? null,
      userId: context.actorUserId ?? null,
      route: (req as any).originalUrl ?? req.url ?? null,
    };
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

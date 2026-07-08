import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
    ? (err as any).statusCode
    : 500;

  const code = typeof statusCode === 'number' ? statusCode : 500;

  // Log unexpected failures with the per-request logger so the stack trace is
  // correlated with the request id/tenant/user (and picked up by AIN-P1-02).
  if (code >= 500) {
    (req as any).log?.error({ err }, 'Unhandled request error');
  }

  const message = typeof err === 'object' && err !== null && 'message' in err
    ? (err as any).message
    : 'Prišlo je do napake';

  if (typeof (res as any).fail === 'function') {
    return (res as any).fail(message, code);
  }
  return res.status(code).json({
    success: false,
    data: null,
    error: typeof message === 'string' ? message : 'Prišlo je do napake',
  });
}

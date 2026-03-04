import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
    ? (err as any).statusCode
    : 500;

  const message = typeof err === 'object' && err !== null && 'message' in err
    ? (err as any).message
    : 'Prišlo je do napake';

  const code = typeof statusCode === 'number' ? statusCode : 500;
  if (typeof (res as any).fail === 'function') {
    return (res as any).fail(message, code);
  }
  return res.status(code).json({
    success: false,
    data: null,
    error: typeof message === 'string' ? message : 'Prišlo je do napake',
  });
}

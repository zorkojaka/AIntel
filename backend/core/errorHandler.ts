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

  return res.fail(message, typeof statusCode === 'number' ? statusCode : 500);
}

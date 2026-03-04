import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Response {
      success: (data?: unknown, statusCode?: number) => Response;
      fail: (errorMessage?: string, statusCode?: number) => Response;
    }
  }
}

export function responseHelpers(req: Request, res: Response, next: NextFunction) {
  res.success = function (data: unknown = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      error: null
    });
  };

  res.fail = function (errorMessage: string = 'Prišlo je do napake', statusCode = 500) {
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: typeof errorMessage === 'string' ? errorMessage : 'Prišlo je do napake'
    });
  };

  next();
}

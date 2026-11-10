import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err.stack);
  }
  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : err.message,
    message: err.message,
  });
};

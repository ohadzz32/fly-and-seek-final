

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';


interface ErrorResponse {
  success: false;
  error: {
    message: string;
    statusCode: number;
    stack?: string;
  };
}


export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Default to 500 server error
  let statusCode = 500;
  let message = 'Internal server error';

  // Check if it's our custom AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    
    // Only log operational errors as warnings
    if (err.isOperational) {
      logger.warn(`Operational error: ${message}`, {
        statusCode,
        path: req.path,
        method: req.method
      });
    } else {
      // Non-operational errors are serious - log as error
      logger.error(`Non-operational error: ${message}`, {
        error: err,
        stack: err.stack
      });
    }
  } else {
    // Unknown error - log full details
    logger.error('Unexpected error', {
      error: err,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      message,
      statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  };

  res.status(statusCode).json(response);
}


export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}


export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new AppError(`Route not found: ${req.originalUrl}`, 404);
  next(error);
}

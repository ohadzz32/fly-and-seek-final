export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    statusCode: number = 500,
    originalError?: Error,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.originalError = originalError;

    // Maintains proper stack trace for debugging
    Error.captureStackTrace(this, this.constructor);
    
    // Set prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }
}


export class ValidationError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 400, originalError);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}


export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with id '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}


export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    super(`External service '${service}' failed`, 503, originalError);
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

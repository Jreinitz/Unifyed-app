// Application error codes
export const ErrorCodes = {
  // Auth errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // Business logic errors
  OFFER_NOT_ACTIVE: 'OFFER_NOT_ACTIVE',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  LINK_EXPIRED: 'LINK_EXPIRED',
  LINK_REVOKED: 'LINK_REVOKED',
  INSUFFICIENT_INVENTORY: 'INSUFFICIENT_INVENTORY',
  CHECKOUT_EXPIRED: 'CHECKOUT_EXPIRED',
  
  // Integration errors
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  SHOPIFY_ERROR: 'SHOPIFY_ERROR',
  TIKTOK_ERROR: 'TIKTOK_ERROR',
  YOUTUBE_ERROR: 'YOUTUBE_ERROR',
  OAUTH_ERROR: 'OAUTH_ERROR',
  WEBHOOK_VERIFICATION_FAILED: 'WEBHOOK_VERIFICATION_FAILED',
  
  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// HTTP status code mapping
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.INVALID_CREDENTIALS]: 401,
  [ErrorCodes.SESSION_EXPIRED]: 401,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.INVALID_INPUT]: 400,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.ALREADY_EXISTS]: 409,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.OFFER_NOT_ACTIVE]: 400,
  [ErrorCodes.OFFER_EXPIRED]: 400,
  [ErrorCodes.LINK_EXPIRED]: 410,
  [ErrorCodes.LINK_REVOKED]: 410,
  [ErrorCodes.INSUFFICIENT_INVENTORY]: 400,
  [ErrorCodes.CHECKOUT_EXPIRED]: 410,
  [ErrorCodes.INTEGRATION_ERROR]: 502,
  [ErrorCodes.SHOPIFY_ERROR]: 502,
  [ErrorCodes.TIKTOK_ERROR]: 502,
  [ErrorCodes.YOUTUBE_ERROR]: 502,
  [ErrorCodes.OAUTH_ERROR]: 400,
  [ErrorCodes.WEBHOOK_VERIFICATION_FAILED]: 401,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.RATE_LIMITED]: 429,
};

// Application error class
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  get statusCode(): number {
    return ErrorHttpStatus[this.code];
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// Error factory functions
export function notFound(resource: string, id?: string): AppError {
  const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
  return new AppError(ErrorCodes.NOT_FOUND, message, { resource, id });
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError(ErrorCodes.UNAUTHORIZED, message);
}

export function forbidden(message = 'Forbidden'): AppError {
  return new AppError(ErrorCodes.FORBIDDEN, message);
}

export function validationError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, message, details);
}

export function conflict(message: string): AppError {
  return new AppError(ErrorCodes.CONFLICT, message);
}

export function integrationError(platform: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError(ErrorCodes.INTEGRATION_ERROR, `${platform}: ${message}`, { platform, ...details });
}

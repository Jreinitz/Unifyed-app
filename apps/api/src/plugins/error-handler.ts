import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ErrorCodes } from '@unifyed/utils';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error);

  // Handle AppError
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation error',
        details: error.flatten(),
      },
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: error.message,
        details: error.validation,
      },
    });
  }

  // Handle unauthorized errors from JWT plugin
  if (error.statusCode === 401) {
    return reply.status(401).send({
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: error.message || 'Unauthorized',
      },
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: {
        code: ErrorCodes.RATE_LIMITED,
        message: 'Too many requests',
      },
    });
  }

  // Default to internal error
  return reply.status(500).send({
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: process.env['NODE_ENV'] === 'production' 
        ? 'Internal server error' 
        : error.message,
    },
  });
}

import {
  BaseError as SequelizeBaseError,
  ConnectionError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

const BODY_PARSER_ERRORS = {
  'entity.parse.failed': {
    status: 400,
    code: 'INVALID_JSON',
    message: 'Request body is not valid JSON',
  },
  'entity.too.large': {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body is too large',
  },
  'encoding.unsupported': {
    status: 415,
    code: 'UNSUPPORTED_ENCODING',
    message: 'Unsupported content encoding',
  },
  'charset.unsupported': {
    status: 415,
    code: 'UNSUPPORTED_CHARSET',
    message: 'Unsupported charset',
  },
};

/** Converts any thrown value into { status, code, message, details? } safe for clients. */
export function normalizeError(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  if (err?.type && BODY_PARSER_ERRORS[err.type]) {
    return BODY_PARSER_ERRORS[err.type];
  }
  // UniqueConstraintError extends ValidationError, so check it first.
  if (err instanceof UniqueConstraintError) {
    return { status: 409, code: 'CONFLICT', message: 'A record with these details already exists' };
  }
  if (err instanceof SequelizeValidationError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.errors.map((item) => ({ path: item.path, message: item.message })),
    };
  }
  if (err instanceof ConnectionError) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is temporarily unavailable',
    };
  }
  if (err instanceof SequelizeBaseError) {
    return {
      status: 500,
      code: 'DATABASE_ERROR',
      message: 'An unexpected database error occurred',
    };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}

/**
 * Final Express error handler. Responds with
 *   { "error": { "code", "message", "details"? } }
 * and logs server-side failures. Internal details never reach clients in production.
 */
export function errorHandler({ logger, isProduction }) {
  // Express identifies error handlers by their four-argument signature.
  return (err, req, res, _next) => {
    const { status, code, message, details } = normalizeError(err);
    const path = req.originalUrl.split('?')[0];

    if (status >= 500) {
      logger.error('Request failed', { method: req.method, path, code, err });
    } else {
      logger.debug('Request rejected', { method: req.method, path, status, code });
    }

    if (res.headersSent) return;

    res.status(status).json({
      error: {
        code,
        message,
        ...(details && { details }),
        ...(!isProduction && status >= 500 && err?.message && { debug: err.message }),
      },
    });
  };
}

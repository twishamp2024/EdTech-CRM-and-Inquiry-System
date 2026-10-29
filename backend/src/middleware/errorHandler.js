import {
  BaseError as SequelizeBaseError,
  ConnectionError,
  DatabaseError,
  TimeoutError,
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

// PostgreSQL errors that mean "temporarily unable", not "bad request":
// query_canceled (statement_timeout), admin/crash shutdown, cannot connect now,
// too many connections, serialization/deadlock.
const TRANSIENT_PG_CODES = new Set(['57014', '57P01', '57P02', '57P03', '53300', '40001', '40P01']);

const DATABASE_UNAVAILABLE = {
  status: 503,
  code: 'DATABASE_UNAVAILABLE',
  message: 'The service is temporarily unavailable. Please try again shortly.',
};

/**
 * Field-level errors: one entry per field (the first problem found), plus an
 * entry per unknown field. Root-level problems have no `field`.
 */
function formatZodIssues(issues) {
  const details = [];
  const seen = new Set();
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        details.push({
          field: [...issue.path, key].join('.'),
          message: `Unknown field "${key}" is not allowed`,
        });
      }
      continue;
    }
    const field = issue.path.join('.');
    if (seen.has(field)) continue;
    seen.add(field);
    details.push(field ? { field, message: issue.message } : { message: issue.message });
  }
  return details;
}

/** Converts any thrown value into { status, code, message, details? } safe for clients. */
export function normalizeError(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some fields are missing or invalid.',
      details: formatZodIssues(err.issues),
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
      details: err.errors.map((item) => ({ field: item.path, message: item.message })),
    };
  }
  if (err instanceof ConnectionError || err instanceof TimeoutError) {
    return DATABASE_UNAVAILABLE;
  }
  if (err instanceof DatabaseError && TRANSIENT_PG_CODES.has(err.original?.code)) {
    return DATABASE_UNAVAILABLE;
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
 *   { "success": false, "error": { "code", "message", "details"? } }
 * and logs server-side failures with full detail. Clients never receive stack
 * traces, SQL, driver messages or connection details, in any environment.
 */
export function errorHandler({ logger }) {
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
      success: false,
      error: { code, message, ...(details && { details }) },
    });
  };
}

import {
  ConnectionError,
  DatabaseError,
  UniqueConstraintError,
  ValidationError,
  ValidationErrorItem,
} from 'sequelize';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler, normalizeError } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';
import { captureLogger } from '../helpers/testApp.js';

function fakeRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const fakeReq = { method: 'GET', originalUrl: '/api/thing?q=secret' };

describe('normalizeError', () => {
  it('passes AppError through', () => {
    expect(normalizeError(new AppError(401, 'TOKEN_EXPIRED', 'Token expired'))).toEqual({
      status: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Token expired',
      details: undefined,
    });
  });

  it('maps ZodError to 400 with field details', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    expect(normalizeError(result.error)).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'email', message: expect.any(String) }],
    });
  });

  it('maps Sequelize errors', () => {
    const item = new ValidationErrorItem('bad', 'Validation error', 'name', 'x');
    expect(normalizeError(new ValidationError('bad', [item]))).toMatchObject({
      status: 400,
      details: [{ path: 'name', message: 'bad' }],
    });
    expect(normalizeError(new UniqueConstraintError({ errors: [item] }))).toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
    expect(normalizeError(new ConnectionError(new Error('down')))).toMatchObject({
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
    });
    expect(normalizeError(new DatabaseError(new Error('syntax')))).toMatchObject({
      status: 500,
      code: 'DATABASE_ERROR',
    });
  });

  it('hides unknown errors behind a generic 500', () => {
    expect(normalizeError(new Error('secret internal detail'))).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});

describe('errorHandler', () => {
  it('omits internal messages in production and logs the failure', () => {
    const { logger, entries } = captureLogger();
    const res = fakeRes();
    errorHandler({ logger, isProduction: true })(
      new Error('secret internal detail'),
      fakeReq,
      res,
      () => {},
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(entries[0]).toMatchObject({
      level: 'error',
      meta: { path: '/api/thing', code: 'INTERNAL_ERROR' },
    });
  });

  it('includes the underlying message outside production to aid debugging', () => {
    const { logger } = captureLogger();
    const res = fakeRes();
    errorHandler({ logger, isProduction: false })(new Error('boom'), fakeReq, res, () => {});

    expect(res.body.error.debug).toBe('boom');
  });

  it('does not log client errors at error level', () => {
    const { logger, entries } = captureLogger();
    errorHandler({ logger, isProduction: true })(
      new AppError(404, 'NOT_FOUND', 'nope'),
      fakeReq,
      fakeRes(),
      () => {},
    );
    expect(entries.map((e) => e.level)).toEqual(['debug']);
  });
});

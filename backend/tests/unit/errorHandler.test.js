import {
  ConnectionError,
  DatabaseError,
  TimeoutError,
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
      details: [{ field: 'email', message: expect.any(String) }],
    });
  });

  it('maps Sequelize errors', () => {
    const item = new ValidationErrorItem('bad', 'Validation error', 'name', 'x');
    expect(normalizeError(new ValidationError('bad', [item]))).toMatchObject({
      status: 400,
      details: [{ field: 'name', message: 'bad' }],
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

  it.each(['57014', '57P01', '57P03', '53300', '40001', '40P01'])(
    'maps transient PostgreSQL error %s to 503',
    (code) => {
      const err = new DatabaseError(Object.assign(new Error('transient'), { code }));
      expect(normalizeError(err)).toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
    },
  );

  it('maps Sequelize timeouts to 503', () => {
    expect(normalizeError(new TimeoutError(new Error('lock timeout')))).toMatchObject({
      status: 503,
    });
  });

  it('formats unknown keys and root-level Zod issues', () => {
    const strict = z.strictObject({ a: z.string() });
    expect(normalizeError(strict.safeParse({ a: 'x', b: 1 }).error).details).toEqual([
      { field: 'b', message: 'Unknown field "b" is not allowed' },
    ]);
    expect(normalizeError(strict.safeParse([]).error).details).toEqual([
      { message: expect.any(String) },
    ]);
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
  it('omits internal messages and logs the failure server-side', () => {
    const { logger, entries } = captureLogger();
    const res = fakeRes();
    errorHandler({ logger })(new Error('secret internal detail'), fakeReq, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(entries[0]).toMatchObject({
      level: 'error',
      meta: { path: '/api/thing', code: 'INTERNAL_ERROR' },
    });
  });

  it('never sends internal messages, in any environment', () => {
    const { logger } = captureLogger();
    const res = fakeRes();
    errorHandler({ logger })(new Error('boom: postgres://user:pw@host/db'), fakeReq, res, () => {});

    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  it('does not log client errors at error level', () => {
    const { logger, entries } = captureLogger();
    errorHandler({ logger })(new AppError(404, 'NOT_FOUND', 'nope'), fakeReq, fakeRes(), () => {});
    expect(entries.map((e) => e.level)).toEqual(['debug']);
  });
});

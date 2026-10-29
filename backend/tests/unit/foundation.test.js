import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { validate } from '../../src/middleware/validate.js';
import { createLogger } from '../../src/utils/logger.js';
import { uuidParamSchema } from '../../src/validators/common.schema.js';

function memoryStream() {
  const lines = [];
  return { lines, write: (chunk) => lines.push(chunk) };
}

describe('logger', () => {
  it('writes one JSON object per line in json format', () => {
    const out = memoryStream();
    createLogger({ level: 'info', format: 'json', stream: out, errorStream: out }).info('hello', {
      port: 4000,
    });

    const entry = JSON.parse(out.lines[0]);
    expect(entry).toMatchObject({ level: 'info', msg: 'hello', port: 4000 });
    expect(out.lines[0].endsWith('\n')).toBe(true);
  });

  it('respects the level threshold', () => {
    const out = memoryStream();
    const logger = createLogger({ level: 'warn', stream: out, errorStream: out });
    logger.info('skip');
    logger.debug('skip');
    logger.warn('keep');
    expect(out.lines).toHaveLength(1);
  });

  it('serialises errors without stacks in json format', () => {
    const out = memoryStream();
    createLogger({ format: 'json', stream: out, errorStream: out }).error('failed', {
      err: Object.assign(new Error('nope'), { code: 'E1' }),
    });
    expect(JSON.parse(out.lines[0]).err).toEqual({ name: 'Error', message: 'nope', code: 'E1' });
  });

  it('writes nothing when silent', () => {
    const out = memoryStream();
    createLogger({ level: 'silent', stream: out, errorStream: out }).error('x');
    expect(out.lines).toHaveLength(0);
  });
});

describe('validate middleware', () => {
  const id = '6f1c3c1e-3f5b-4c8e-9a51-2b0b7f0e9d11';

  it('stores parsed values on req.validated', () => {
    const req = { params: { id, extra: 'dropped' } };
    const next = vi.fn();
    validate({ params: uuidParamSchema })(req, {}, next);

    expect(req.validated.params).toEqual({ id });
    expect(next).toHaveBeenCalledWith();
  });

  it('throws a ZodError for invalid input (Express 5 forwards it to the error handler)', () => {
    const next = vi.fn();
    expect(() => validate({ params: uuidParamSchema })({ params: { id: '42' } }, {}, next)).toThrow(
      ZodError,
    );
    expect(next).not.toHaveBeenCalled();
  });
});

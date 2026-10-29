import { ConnectionRefusedError, DatabaseError, UniqueConstraintError } from 'sequelize';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, captureLogger, TEST_ORIGIN } from '../helpers/testApp.js';

const ID = '6f1c3c1e-3f5b-4c8e-9a51-2b0b7f0e9d11';

const validBody = (overrides = {}) => ({
  name: 'Asha Verma',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  userType: 'Parent',
  category: 'Admission',
  message: 'When does admission open for grade 6?',
  ...overrides,
});

function appWith(createInquiry, { env, logger } = {}) {
  return buildTestApp({ env, logger, services: { inquiryService: { createInquiry } } });
}

const created = () => vi.fn().mockResolvedValue({ inquiry: { id: ID }, created: true });

const post = (app, body) => request(app).post('/api/inquiries').send(body);

describe('POST /api/inquiries — success', () => {
  it('creates an inquiry and returns 201 with the record id', async () => {
    const createInquiry = created();
    const res = await post(appWith(createInquiry), validBody());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: 'Thank you! Your inquiry has been received.',
      data: { id: ID, duplicate: false },
    });
    expect(createInquiry).toHaveBeenCalledOnce();
  });

  it('is public: no Authorization header or session is needed', async () => {
    const res = await post(appWith(created()), validBody());
    expect(res.request.getHeader?.('Authorization')).toBeUndefined();
    expect(res.status).toBe(201);
  });

  it('works for browser requests from the configured frontend origin', async () => {
    const res = await request(appWith(created()))
      .post('/api/inquiries')
      .set('Origin', TEST_ORIGIN)
      .send(validBody());

    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
  });

  it('passes only sanitised, approved fields to the service', async () => {
    const createInquiry = created();
    await post(
      appWith(createInquiry),
      validBody({ name: '  Asha  Verma ', email: ' ASHA@Example.com ', category: ' Concert ' }),
    );

    expect(createInquiry).toHaveBeenCalledWith({
      name: 'Asha Verma',
      email: 'asha@example.com',
      phone: '+91 98765 43210',
      userType: 'Parent',
      category: 'Concert',
      message: 'When does admission open for grade 6?',
    });
  });

  it('answers a repeated identical submission with 200 and the existing id', async () => {
    const createInquiry = vi.fn().mockResolvedValue({ inquiry: { id: ID }, created: false });
    const res = await post(appWith(createInquiry), validBody());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'We have already received this inquiry. Our team will get back to you soon.',
      data: { id: ID, duplicate: true },
    });
  });
});

describe('POST /api/inquiries — validation (400)', () => {
  it('lists every missing required field', async () => {
    const createInquiry = created();
    const res = await post(appWith(createInquiry), {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are missing or invalid.',
        details: [
          { field: 'name', message: 'Name is required' },
          { field: 'email', message: 'Email is required' },
          { field: 'phone', message: 'Phone number is required' },
          { field: 'userType', message: 'User type is required' },
          { field: 'category', message: 'Category is required' },
          { field: 'message', message: 'Message is required' },
        ],
      },
    });
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it.each(['name', 'email', 'phone', 'userType', 'category', 'message'])(
    'rejects a missing %s',
    async (field) => {
      const body = validBody();
      delete body[field];
      const res = await post(appWith(created()), body);

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([
        { field, message: expect.stringContaining('is required') },
      ]);
    },
  );

  it('rejects whitespace-only fields', async () => {
    const res = await post(appWith(created()), validBody({ name: '   ', message: '\n\t ' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['name', 'message']);
  });

  it('rejects an invalid email', async () => {
    const createInquiry = created();
    const res = await post(appWith(createInquiry), validBody({ email: 'asha@example' }));

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'email', message: 'Enter a valid email address, for example name@example.com' },
    ]);
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it('rejects an invalid category and user type', async () => {
    const res = await post(
      appWith(created()),
      validBody({ category: 'Sports Day', userType: 'Teacher' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'userType', message: 'User type must be one of: Parent, Student, School' },
      {
        field: 'category',
        message: 'Category must be one of: Scholarship, Concert, Admission, General Query',
      },
    ]);
  });

  it('rejects an invalid phone number', async () => {
    const res = await post(appWith(created()), validBody({ phone: '12-34' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ field: 'phone' });
  });

  it('rejects an over-long message', async () => {
    const res = await post(appWith(created()), validBody({ message: 'x'.repeat(2001) }));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'message', message: 'Message must be at most 2000 characters' },
    ]);
  });

  it('rejects attempts to set unapproved fields (mass assignment)', async () => {
    const createInquiry = created();
    const res = await post(
      appWith(createInquiry),
      validBody({ status: 'Resolved', id: ID, createdAt: '2020-01-01' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'status', message: 'Unknown field "status" is not allowed' },
      { field: 'id', message: 'Unknown field "id" is not allowed' },
      { field: 'createdAt', message: 'Unknown field "createdAt" is not allowed' },
    ]);
    expect(createInquiry).not.toHaveBeenCalled();
  });
});

describe('POST /api/inquiries — malformed and oversized requests', () => {
  const raw = (app, body, type = 'application/json') =>
    request(app).post('/api/inquiries').set('Content-Type', type).send(body);

  it('rejects malformed JSON with 400', async () => {
    const createInquiry = created();
    const res = await raw(appWith(createInquiry), '{"name": "Asha", ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it('rejects a JSON array body with 400', async () => {
    const res = await raw(appWith(created()), JSON.stringify([validBody()]));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ message: 'Request body must be a JSON object' }]);
  });

  it('rejects an empty JSON body with 400 and field errors', async () => {
    const res = await raw(appWith(created()), '');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveLength(6);
  });

  it('rejects bodies larger than 20 kb with 413', async () => {
    const createInquiry = created();
    const res = await raw(
      appWith(createInquiry),
      JSON.stringify(validBody({ message: 'x'.repeat(21 * 1024) })),
    );

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(createInquiry).not.toHaveBeenCalled();
  });

  it.each([
    ['application/x-www-form-urlencoded', 'name=Asha&email=asha%40example.com'],
    ['text/plain', JSON.stringify(validBody())],
  ])('rejects %s bodies with 415', async (type, body) => {
    const createInquiry = created();
    const res = await raw(appWith(createInquiry), body, type);

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(createInquiry).not.toHaveBeenCalled();
  });
});

describe('POST /api/inquiries — database failures', () => {
  const secretBits = ['p@ssw0rd', 'pooler.supabase.com', 'INSERT INTO', 'at ', 'stack'];

  function expectNoLeaks(res) {
    const text = JSON.stringify(res.body);
    for (const bit of secretBits) expect(text).not.toContain(bit);
    expect(res.body.success).toBe(false);
    expect(res.body).not.toHaveProperty('data');
  }

  it('returns 503 when the database cannot be reached, and does not report success', async () => {
    const { logger, entries } = captureLogger();
    const cause = Object.assign(
      new Error('connect ECONNREFUSED aws-0-eu-west-1.pooler.supabase.com:5432 (p@ssw0rd)'),
      { code: 'ECONNREFUSED' },
    );
    const res = await post(
      appWith(vi.fn().mockRejectedValue(new ConnectionRefusedError(cause)), { logger }),
      validBody(),
    );

    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Please try again shortly.',
    });
    expectNoLeaks(res);
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'Request failed' }),
    );
  });

  it('returns 503 when a query times out', async () => {
    const timeout = new DatabaseError(
      Object.assign(new Error('canceling statement due to statement timeout'), {
        code: '57014',
        sql: 'INSERT INTO "inquiries" ...',
      }),
    );
    const res = await post(appWith(vi.fn().mockRejectedValue(timeout)), validBody());

    expect(res.status).toBe(503);
    expectNoLeaks(res);
  });

  it('returns a generic 500 for other database errors', async () => {
    const failure = new DatabaseError(
      Object.assign(new Error('relation "inquiries" does not exist'), {
        code: '42P01',
        sql: 'INSERT INTO "inquiries" ...',
      }),
    );
    const res = await post(appWith(vi.fn().mockRejectedValue(failure)), validBody());

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'DATABASE_ERROR',
      message: 'An unexpected database error occurred',
    });
    expectNoLeaks(res);
  });

  it('returns a generic 500 for unexpected errors without a stack trace', async () => {
    const res = await post(
      appWith(vi.fn().mockRejectedValue(new Error('boom with p@ssw0rd'))),
      validBody(),
    );

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expectNoLeaks(res);
  });

  it('maps a unique-constraint violation to 409', async () => {
    const res = await post(
      appWith(vi.fn().mockRejectedValue(new UniqueConstraintError({ errors: [] }))),
      validBody(),
    );
    expect(res.status).toBe(409);
    expectNoLeaks(res);
  });
});

describe('POST /api/inquiries — rate limiting', () => {
  const env = { INQUIRY_RATE_LIMIT_MAX: '2', INQUIRY_RATE_LIMIT_WINDOW_MINUTES: '15' };

  it('allows the configured number of submissions, then returns 429', async () => {
    const createInquiry = created();
    const app = appWith(createInquiry, { env });

    expect((await post(app, validBody())).status).toBe(201);
    const second = await post(app, validBody());
    expect(second.status).toBe(201);
    expect(second.headers.ratelimit).toMatch(/r=0/);

    const third = await post(app, validBody());
    expect(third.status).toBe(429);
    expect(third.body).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect(createInquiry).toHaveBeenCalledTimes(2);
  });

  it('counts invalid submissions too', async () => {
    const app = appWith(created(), { env });
    await post(app, {});
    await post(app, {});
    expect((await post(app, validBody())).status).toBe(429);
  });

  it('keeps limits separate per app instance (no shared state between tests)', async () => {
    expect((await post(appWith(created(), { env }), validBody())).status).toBe(201);
  });
});

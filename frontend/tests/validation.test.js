import { describe, expect, it } from 'vitest';
import * as backendConstants from '../../backend/src/constants/inquiry.js';
import { createInquirySchema } from '../../backend/src/validators/inquiry.schema.js';
import * as frontendConstants from '../src/constants/inquiry.js';
import { inquiryFormSchema } from '../src/validation/inquiry.schema.js';
import { loginFormSchema } from '../src/validation/login.schema.js';

const valid = {
  userType: 'Parent',
  category: 'Admission',
  name: 'Asha Verma',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  message: 'When does admission open for grade 6?',
};

describe('frontend and backend agree', () => {
  it('on allowed user types and categories', () => {
    expect(frontendConstants.USER_TYPES).toEqual(backendConstants.USER_TYPES);
    expect(frontendConstants.CATEGORIES).toEqual(backendConstants.CATEGORIES);
  });

  it('on length limits', () => {
    const backend = backendConstants.FIELD_LIMITS;
    const frontend = frontendConstants.FIELD_LIMITS;
    expect(frontend.name).toEqual(backend.name);
    expect(frontend.email).toEqual(backend.email);
    expect(frontend.phone).toEqual(backend.phone);
    expect(frontend.message.max).toBe(backend.message.max);
  });

  // The same inputs must be accepted or rejected by both, so the form never
  // blocks something the API accepts, nor lets through something it rejects.
  it.each([
    {},
    { name: '  Zoë Ångström ' },
    { name: 'A' },
    { name: '12345' },
    { name: 'x'.repeat(101) },
    { email: 'ASHA@Example.com' },
    { email: 'asha@example' },
    { email: `${'a'.repeat(250)}@example.com` },
    { phone: '+1 (555) 010-0000' },
    { phone: '020 7946 0958' },
    { phone: '12345' },
    { phone: '98765+43210' },
    { phone: '-9876543210' },
    { phone: '1234567890123456' },
    { phone: '+1 (555) 010-0000 ext 12' },
    { userType: 'Teacher' },
    { userType: '' },
    { category: 'Sports' },
    { message: 'Too short' },
    { message: '   valid message here   ' },
    { message: 'm'.repeat(2001) },
    { message: 'Hello there\u0007!' },
  ])('for %o', (override) => {
    const input = { ...valid, ...override };
    expect(inquiryFormSchema.safeParse(input).success).toBe(
      createInquirySchema.safeParse(input).success,
    );
  });
});

describe('loginFormSchema', () => {
  it('requires a valid email and a password, without trimming the password', () => {
    expect(loginFormSchema.safeParse({ email: '', password: '' }).success).toBe(false);
    expect(loginFormSchema.safeParse({ email: 'x', password: 'p' }).success).toBe(false);
    const parsed = loginFormSchema.parse({ email: ' ops@school.org ', password: ' secret ' });
    expect(parsed).toEqual({ email: 'ops@school.org', password: ' secret ' });
  });
});

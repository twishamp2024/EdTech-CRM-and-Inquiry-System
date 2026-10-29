import { describe, expect, it } from 'vitest';
import { normalizeError } from '../../src/middleware/errorHandler.js';
import { createInquirySchema } from '../../src/validators/inquiry.schema.js';

const valid = (overrides = {}) => ({
  name: 'Asha Verma',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  userType: 'Parent',
  category: 'Admission',
  message: 'When does admission open for grade 6?',
  ...overrides,
});

/** Field → message map, exactly as the API would return it. */
function fieldErrors(input) {
  const result = createInquirySchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    normalizeError(result.error).details.map((d) => [d.field ?? '(body)', d.message]),
  );
}

describe('createInquirySchema — valid input', () => {
  it('accepts a complete inquiry', () => {
    expect(createInquirySchema.parse(valid())).toEqual(valid());
  });

  it('trims every field and normalises whitespace, email case and line endings', () => {
    const parsed = createInquirySchema.parse({
      name: '  Asha   Verma  ',
      email: '  Asha@Example.COM ',
      phone: ' +91  98765   43210 ',
      userType: ' Parent ',
      category: ' General Query ',
      message: '  Line one\r\nLine two  ',
    });
    expect(parsed).toEqual({
      name: 'Asha Verma',
      email: 'asha@example.com',
      phone: '+91 98765 43210',
      userType: 'Parent',
      category: 'General Query',
      message: 'Line one\nLine two',
    });
  });

  it.each([
    '+1 (555) 010-0000',
    '+44 20 7946 0958',
    '020 7946 0958',
    '+61 2 9374 4000',
    '0049-30-901820',
    '+81 3-1234-5678',
    '5550100',
    '+123456789012345',
  ])('accepts international phone number %s', (phone) => {
    expect(fieldErrors(valid({ phone }))).toEqual({});
  });

  it.each(['Zoë Ångström', "Seán O'Brien", '李小龙', 'José-María', 'Dr. A. K.'])(
    'accepts name %s',
    (name) => {
      expect(fieldErrors(valid({ name }))).toEqual({});
    },
  );

  it('accepts values at the maximum lengths', () => {
    expect(
      fieldErrors(
        valid({
          name: 'a'.repeat(100),
          email: `${'a'.repeat(242)}@example.com`,
          message: 'm'.repeat(2000),
        }),
      ),
    ).toEqual({});
  });
});

describe('createInquirySchema — required fields', () => {
  it('reports every missing field with a readable message', () => {
    expect(fieldErrors({})).toEqual({
      name: 'Name is required',
      email: 'Email is required',
      phone: 'Phone number is required',
      userType: 'User type is required',
      category: 'Category is required',
      message: 'Message is required',
    });
  });

  it.each(['', '   ', '\t\n'])('treats %j as empty', (blank) => {
    const errors = fieldErrors(
      valid({ name: blank, email: blank, phone: blank, message: blank, userType: blank }),
    );
    expect(errors).toMatchObject({
      name: 'Name is required',
      email: 'Email is required',
      phone: 'Phone number is required',
      message: 'Message is required',
      userType: 'User type is required',
    });
  });

  it('treats null as missing', () => {
    expect(fieldErrors(valid({ name: null }))).toEqual({ name: 'Name is required' });
  });

  it('rejects non-string values', () => {
    expect(fieldErrors(valid({ name: 42, phone: ['555'] }))).toEqual({
      name: 'Name must be text',
      phone: 'Phone number must be text',
    });
  });
});

describe('createInquirySchema — field rules', () => {
  it.each([
    'plainaddress',
    'missing-at.example.com',
    'name@',
    '@example.com',
    'name@example',
    'name @example.com',
    'name@exa mple.com',
    'name@@example.com',
  ])('rejects invalid email %s', (email) => {
    expect(fieldErrors(valid({ email }))).toEqual({
      email: 'Enter a valid email address, for example name@example.com',
    });
  });

  it('rejects emails longer than 254 characters', () => {
    expect(fieldErrors(valid({ email: `${'a'.repeat(250)}@example.com` }))).toEqual({
      email: 'Email must be at most 254 characters',
    });
  });

  it.each([
    ['call me maybe', /only digits/],
    ['98765abc43', /only digits/],
    ['98765+43210', /only digits/],
    ['-9876543210', /only digits/],
    ['12345', /7–15 digits/],
    ['1234567890123456', /7–15 digits/],
    ['+1 (555) 010-0000 ext 12', /at most 20 characters/],
  ])('rejects phone %s', (phone, expected) => {
    expect(fieldErrors(valid({ phone })).phone).toMatch(expected);
  });

  it.each(['Teacher', 'parent', 'PARENT', 'Parents'])('rejects user type %s', (userType) => {
    expect(fieldErrors(valid({ userType }))).toEqual({
      userType: 'User type must be one of: Parent, Student, School',
    });
  });

  it.each(['Sports', 'admission', 'General', 'General  Query'])(
    'rejects category %s',
    (category) => {
      expect(fieldErrors(valid({ category }))).toEqual({
        category: 'Category must be one of: Scholarship, Concert, Admission, General Query',
      });
    },
  );

  it('enforces name length and requires a letter', () => {
    expect(fieldErrors(valid({ name: 'A' }))).toEqual({
      name: 'Name must be at least 2 characters',
    });
    expect(fieldErrors(valid({ name: 'a'.repeat(101) }))).toEqual({
      name: 'Name must be at most 100 characters',
    });
    expect(fieldErrors(valid({ name: '12345' }))).toEqual({
      name: 'Name must include at least one letter',
    });
  });

  it('enforces message length', () => {
    expect(fieldErrors(valid({ message: 'Too short' }))).toEqual({
      message: 'Message must be at least 10 characters',
    });
    expect(fieldErrors(valid({ message: 'm'.repeat(2001) }))).toEqual({
      message: 'Message must be at most 2000 characters',
    });
  });

  it('rejects control characters such as NUL bytes', () => {
    expect(fieldErrors(valid({ name: 'Asha\u0000Verma', message: 'Hello there\u0007!' }))).toEqual({
      name: 'Name contains characters that are not allowed',
      message: 'Message contains characters that are not allowed',
    });
  });

  it('reports only the first problem for each field', () => {
    const result = createInquirySchema.safeParse(valid({ name: '' }));
    expect(normalizeError(result.error).details).toEqual([
      { field: 'name', message: 'Name is required' },
    ]);
  });
});

describe('createInquirySchema — body shape and mass assignment', () => {
  it.each([
    ['status', 'Resolved'],
    ['id', '6f1c3c1e-3f5b-4c8e-9a51-2b0b7f0e9d11'],
    ['createdAt', '2020-01-01T00:00:00Z'],
    ['isAdmin', true],
  ])('rejects the unapproved field %s', (key, value) => {
    expect(fieldErrors(valid({ [key]: value }))).toEqual({
      [key]: `Unknown field "${key}" is not allowed`,
    });
  });

  it.each([[[]], [null], ['a string'], [42]])('rejects a non-object body %j', (body) => {
    expect(fieldErrors(body)).toEqual({ '(body)': 'Request body must be a JSON object' });
  });
});

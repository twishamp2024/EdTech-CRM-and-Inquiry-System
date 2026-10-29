import { z } from 'zod';
import { CATEGORIES, FIELD_LIMITS, INQUIRY_STATUSES, USER_TYPES } from '../constants/inquiry.js';

// C0 control characters and DEL, except tab, line feed and carriage return.
// Matching control characters is the point of this pattern.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

// International format, not tied to one country: optional leading "+",
// starts with a digit or "(", ends with a digit or ")", and contains only
// digits, spaces, hyphens and brackets in between. Digit count is checked
// separately (E.164 allows at most 15 digits).
const PHONE_FORMAT = /^\+?[0-9(][0-9() -]*[0-9)]$/;

export const INQUIRY_MESSAGE_MIN_LENGTH = 10;

const collapseWhitespace = (value) => value.replace(/\s+/g, ' ');

/** A trimmed, required string without control characters. */
function requiredText(label) {
  return z
    .string({
      error: (issue) =>
        issue.input === undefined || issue.input === null
          ? `${label} is required`
          : `${label} must be text`,
    })
    .trim()
    .min(1, { error: `${label} is required`, abort: true })
    .refine((value) => !CONTROL_CHARACTERS.test(value), {
      error: `${label} contains characters that are not allowed`,
      abort: true,
    });
}

function choice(label, values) {
  const allowed = values.join(', ');
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.enum(values, {
      error: (issue) =>
        issue.input === undefined || issue.input === null || issue.input === ''
          ? `${label} is required`
          : `${label} must be one of: ${allowed}`,
    }),
  );
}

const { name, email, phone, message } = FIELD_LIMITS;

const phoneSchema = requiredText('Phone number')
  .transform(collapseWhitespace)
  .pipe(
    z
      .string()
      .max(phone.maxLength, {
        error: `Phone number must be at most ${phone.maxLength} characters`,
        abort: true,
      })
      .regex(PHONE_FORMAT, {
        error:
          'Phone number may contain only digits, spaces, hyphens and brackets, with an optional leading +',
        abort: true,
      })
      .refine(
        (value) => {
          const digits = value.replace(/\D/g, '').length;
          return digits >= phone.minDigits && digits <= phone.maxDigits;
        },
        { error: `Phone number must contain ${phone.minDigits}–${phone.maxDigits} digits` },
      ),
  );

/**
 * Body of POST /api/inquiries. Unknown keys are rejected (not silently
 * dropped), so clients cannot set `status`, `id`, timestamps or anything else
 * that is not part of the public form.
 */
export const createInquirySchema = z.strictObject(
  {
    name: requiredText('Name')
      .min(name.min, { error: `Name must be at least ${name.min} characters`, abort: true })
      .max(name.max, { error: `Name must be at most ${name.max} characters`, abort: true })
      .regex(/\p{L}/u, { error: 'Name must include at least one letter' })
      .transform(collapseWhitespace),
    email: requiredText('Email')
      .max(email.max, { error: `Email must be at most ${email.max} characters`, abort: true })
      .toLowerCase()
      .pipe(z.email({ error: 'Enter a valid email address, for example name@example.com' })),
    phone: phoneSchema,
    userType: choice('User type', USER_TYPES),
    category: choice('Category', CATEGORIES),
    message: requiredText('Message')
      .max(message.max, {
        error: `Message must be at most ${message.max} characters`,
        abort: true,
      })
      .min(INQUIRY_MESSAGE_MIN_LENGTH, {
        error: `Message must be at least ${INQUIRY_MESSAGE_MIN_LENGTH} characters`,
      })
      .transform((value) => value.replace(/\r\n?/g, '\n')),
  },
  {
    error: (issue) =>
      issue.code === 'invalid_type' ? 'Request body must be a JSON object' : undefined,
  },
);

export const INQUIRY_PAGE_SIZE_MAX = 100;

const positiveInt = (label, { max, fallback }) =>
  z.coerce
    .number({ error: `${label} must be a whole number` })
    .int({ error: `${label} must be a whole number` })
    .min(1, { error: `${label} must be at least 1` })
    .max(max, { error: `${label} must be at most ${max}` })
    .default(fallback);

/** GET /api/inquiries query string (filters and search are added with the dashboard). */
export const listInquiriesQuerySchema = z.strictObject({
  page: positiveInt('page', { max: 100_000, fallback: 1 }),
  pageSize: positiveInt('pageSize', { max: INQUIRY_PAGE_SIZE_MAX, fallback: 20 }),
});

/** PATCH /api/inquiries/:id/status body. */
export const updateInquiryStatusSchema = z.strictObject(
  { status: choice('Status', INQUIRY_STATUSES) },
  {
    error: (issue) =>
      issue.code === 'invalid_type' ? 'Request body must be a JSON object' : undefined,
  },
);

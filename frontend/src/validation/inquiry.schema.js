import { z } from 'zod';
import { CATEGORIES, FIELD_LIMITS, USER_TYPES } from '../constants/inquiry.js';

// Mirrors backend/src/validators/inquiry.schema.js so users see the same rules
// before submitting. The server still validates everything independently.

// Matching control characters is the point of this pattern.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const PHONE_FORMAT = /^\+?[0-9(][0-9() -]*[0-9)]$/;

const { name, email, phone, message } = FIELD_LIMITS;

const text = (label) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required`, abort: true })
    .refine((value) => !CONTROL_CHARACTERS.test(value), {
      error: `${label} contains characters that are not allowed`,
      abort: true,
    });

const choice = (label, values) =>
  z.string().refine((value) => values.includes(value), {
    error: (issue) =>
      issue.input === ''
        ? `Select a ${label.toLowerCase()}`
        : `${label} must be one of: ${values.join(', ')}`,
  });

export const inquiryFormSchema = z.object({
  userType: choice('User type', USER_TYPES),
  category: choice('Category', CATEGORIES),
  name: text('Name')
    .min(name.min, { error: `Name must be at least ${name.min} characters`, abort: true })
    .max(name.max, { error: `Name must be at most ${name.max} characters`, abort: true })
    .regex(/\p{L}/u, { error: 'Name must include at least one letter' }),
  email: text('Email')
    .max(email.max, { error: `Email must be at most ${email.max} characters`, abort: true })
    .pipe(z.email({ error: 'Enter a valid email address, for example name@example.com' })),
  phone: text('Phone number')
    .transform((value) => value.replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .max(phone.maxLength, {
          error: `Phone number must be at most ${phone.maxLength} characters`,
          abort: true,
        })
        .regex(PHONE_FORMAT, {
          error: 'Use digits, spaces, hyphens or brackets, with an optional leading +',
          abort: true,
        })
        .refine(
          (value) => {
            const digits = value.replace(/\D/g, '').length;
            return digits >= phone.minDigits && digits <= phone.maxDigits;
          },
          { error: `Phone number must contain ${phone.minDigits}–${phone.maxDigits} digits` },
        ),
    ),
  message: text('Message')
    .max(message.max, { error: `Message must be at most ${message.max} characters`, abort: true })
    .min(message.min, { error: `Message must be at least ${message.min} characters` }),
});

export const INQUIRY_FIELDS = Object.freeze([
  'userType',
  'category',
  'name',
  'email',
  'phone',
  'message',
]);

export const emptyInquiry = Object.freeze(
  Object.fromEntries(INQUIRY_FIELDS.map((field) => [field, ''])),
);

import { z } from 'zod';
import { LOGIN_PASSWORD_MAX_LENGTH, PASSWORD_POLICY } from '../constants/auth.js';
import { FIELD_LIMITS } from '../constants/inquiry.js';

const required = (label) => ({
  error: (issue) =>
    issue.input === undefined || issue.input === null
      ? `${label} is required`
      : `${label} must be text`,
});

/** Trimmed, lower-cased, validated email (same normalisation as stored admins). */
export const adminEmailSchema = z
  .string(required('Email'))
  .trim()
  .min(1, { error: 'Email is required', abort: true })
  .max(FIELD_LIMITS.email.max, {
    error: `Email must be at most ${FIELD_LIMITS.email.max} characters`,
    abort: true,
  })
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));

/**
 * POST /api/auth/login. Passwords are not trimmed (spaces are significant)
 * and are length-bounded so bcrypt work per request is bounded.
 */
export const loginSchema = z.strictObject(
  {
    email: adminEmailSchema,
    password: z
      .string(required('Password'))
      .min(1, { error: 'Password is required', abort: true })
      .max(LOGIN_PASSWORD_MAX_LENGTH, {
        error: `Password must be at most ${LOGIN_PASSWORD_MAX_LENGTH} characters`,
      }),
  },
  {
    error: (issue) =>
      issue.code === 'invalid_type' ? 'Request body must be a JSON object' : undefined,
  },
);

// A short list of passwords that satisfy the length rule but are guessed first.
const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  'password123456',
  'passwordpassword',
  'administrator',
  'admin1234567',
  'admin12345678',
  'adminadminadmin',
  'changeme1234',
  'letmein12345',
  'qwertyuiop12',
  'qwerty123456',
  '123456789012',
  'iloveyou1234',
  'welcome12345',
]);

/**
 * Rules for a new admin password. Follows NIST SP 800-63B: length over
 * composition rules, plus rejection of obvious and context-specific guesses.
 * Returns a list of problems (empty when acceptable). Never echoes the password.
 */
export function validateNewPassword(password, { email } = {}) {
  if (typeof password !== 'string' || password.length === 0) return ['Password is required'];

  const problems = [];
  const { minLength, maxBytes, minUniqueCharacters } = PASSWORD_POLICY;
  if ([...password].length < minLength) {
    problems.push(`Password must be at least ${minLength} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > maxBytes) {
    problems.push(`Password must be at most ${maxBytes} bytes (bcrypt ignores anything longer)`);
  }
  if (password.trim().length === 0) {
    problems.push('Password must not be only whitespace');
  }
  if (new Set(password).size < minUniqueCharacters) {
    problems.push(`Password must contain at least ${minUniqueCharacters} different characters`);
  }
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered)) {
    problems.push('Password is too common');
  }
  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && lowered.includes(localPart)) {
    problems.push('Password must not contain the email address');
  }
  return problems;
}

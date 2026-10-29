// Allowed values for inquiries. schema.sql CHECK constraints must list the same
// values; tests/schema/schema.test.js fails if they drift apart.

export const USER_TYPES = Object.freeze(['Parent', 'Student', 'School']);

export const CATEGORIES = Object.freeze(['Scholarship', 'Concert', 'Admission', 'General Query']);

export const INQUIRY_STATUSES = Object.freeze(['New', 'In Progress', 'Resolved']);

export const DEFAULT_INQUIRY_STATUS = 'New';

// Hard limits enforced by the database. Request validators may be stricter.
export const FIELD_LIMITS = Object.freeze({
  name: { min: 2, max: 100 },
  email: { max: 254 },
  phone: { maxLength: 20, minDigits: 7, maxDigits: 15 },
  message: { min: 1, max: 2000 },
});

export const PHONE_PATTERN = /^\+?[0-9() -]+$/;

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

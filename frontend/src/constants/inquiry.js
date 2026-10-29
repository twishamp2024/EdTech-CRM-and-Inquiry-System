// Must match backend/src/constants/inquiry.js (tests/constants.test.js checks).
export const USER_TYPES = Object.freeze(['Parent', 'Student', 'School']);

export const CATEGORIES = Object.freeze(['Scholarship', 'Concert', 'Admission', 'General Query']);

export const FIELD_LIMITS = Object.freeze({
  name: { min: 2, max: 100 },
  email: { max: 254 },
  phone: { maxLength: 20, minDigits: 7, maxDigits: 15 },
  message: { min: 10, max: 2000 },
});

export const INQUIRY_STATUSES = Object.freeze(['New', 'In Progress', 'Resolved']);

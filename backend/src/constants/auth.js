// Every row in `admins` is an administrator. The role is derived on the
// server from that fact; it is never read from a request.
export const ADMIN_ROLE = 'admin';

export const PASSWORD_POLICY = Object.freeze({
  minLength: 12,
  // bcrypt only uses the first 72 bytes of its input; longer passwords would
  // be silently truncated, so they are refused at creation time.
  maxBytes: 72,
  minUniqueCharacters: 5,
});

// Login input is bounded so a request cannot make bcrypt do unbounded work.
export const LOGIN_PASSWORD_MAX_LENGTH = 1024;

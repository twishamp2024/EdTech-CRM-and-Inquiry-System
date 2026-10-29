import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

/** bcrypt hash with the given work factor. The result embeds salt and cost. */
export function hashPassword(password, saltRounds) {
  return bcrypt.hash(password, saltRounds);
}

/** Constant-time comparison performed by bcrypt. */
export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/** Work factor embedded in a bcrypt hash ("$2b$12$…" → 12). */
export function bcryptCost(hash) {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return match ? Number(match[1]) : undefined;
}

const dummyHashes = new Map();

/**
 * A hash of a random secret, used when a login names an unknown email so the
 * response takes as long as a real password check (no account enumeration by
 * timing). Computed once per work factor, lazily.
 */
export function getDummyHash(saltRounds) {
  if (!dummyHashes.has(saltRounds)) {
    dummyHashes.set(saltRounds, bcrypt.hash(randomBytes(32).toString('hex'), saltRounds));
  }
  return dummyHashes.get(saltRounds);
}

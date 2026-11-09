import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** 32 bytes, URL-safe. The raw value is emailed once and never stored. */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Compare two stored digests in constant time. A length mismatch still runs
 * a compare so the function does not throw or return early on the secret's
 * shape.
 */
export function tokenHashesEqual(stored: string, computed: string): boolean {
  const left = Buffer.from(stored);
  const right = Buffer.from(computed);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

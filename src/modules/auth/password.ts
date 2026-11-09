import * as bcrypt from 'bcrypt';

/**
 * Same cost signup already uses. Reset must not drift from it.
 * Callers that store a new password run assertPasswordAllowed first.
 * Login compares an existing hash and does not hash or re-check the policy.
 */
export const PASSWORD_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

import * as bcrypt from 'bcrypt';

/** Same cost signup already uses. Reset must not drift from it. */
export const PASSWORD_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

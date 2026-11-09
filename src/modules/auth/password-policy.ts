import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';

/** New and changed passwords. Login does not use this. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt only uses the first 72 bytes and would otherwise drop the rest
 * without saying so. Reject the password instead.
 */
export const PASSWORD_MAX_BYTES = 72;

export interface PasswordPolicy {
  minLength: number;
  maxBytes: number;
}

export function passwordPolicy(): PasswordPolicy {
  return {
    minLength: PASSWORD_MIN_LENGTH,
    maxBytes: PASSWORD_MAX_BYTES,
  };
}

export interface PasswordIdentity {
  email?: string | null;
  username?: string | null;
}

const TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
const TOO_LONG = `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
const MATCHES_EMAIL = 'Password cannot be your email address.';
const MATCHES_LOCAL = 'Password cannot be the part of your email before @.';
const MATCHES_USERNAME = 'Password cannot be your username.';
const TOO_COMMON = 'That password is too common. Choose a different one.';

/**
 * Top ~10,000 breached passwords, bundled from SecLists
 * Passwords/Common-Credentials/10k-most-common.txt (MIT).
 * Loaded when this module is imported so a missing file fails boot,
 * not the first signup. Never fetched over the network.
 */
const COMMON_PASSWORD_FILE = 'common-passwords.txt';
const COMMON_PASSWORDS = loadCommonPasswords();

/**
 * Rules for a password that is about to be stored. Call this from signup,
 * password reset, and any future change-password path. Login must not call
 * it: a password chosen earlier has to keep working.
 */
export function assertPasswordAllowed(
  password: string,
  identity: PasswordIdentity = {},
): void {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new BadRequestException(TOO_SHORT);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new BadRequestException(TOO_LONG);
  }

  const folded = password.toLowerCase();
  const email = fold(identity.email);
  if (email && folded === email) {
    throw new BadRequestException(MATCHES_EMAIL);
  }
  const local = emailLocalPart(email);
  if (local && folded === local) {
    throw new BadRequestException(MATCHES_LOCAL);
  }
  const username = fold(identity.username);
  if (username && folded === username) {
    throw new BadRequestException(MATCHES_USERNAME);
  }
  if (COMMON_PASSWORDS.has(folded)) {
    throw new BadRequestException(TOO_COMMON);
  }
}

export function commonPasswordCount(): number {
  return COMMON_PASSWORDS.size;
}

function fold(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase();
}

function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '';
  return email.slice(0, at);
}

function loadCommonPasswords(): Set<string> {
  const text = readFileSync(commonPasswordPath(), 'utf8').replace(
    /^\uFEFF/,
    '',
  );
  const set = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim().toLowerCase();
    if (!value || value.startsWith('#')) continue;
    set.add(value);
  }
  if (set.size < 1000) {
    throw new Error('The common password list failed to load.');
  }
  return set;
}

function commonPasswordPath(): string {
  const candidates = [
    join(__dirname, COMMON_PASSWORD_FILE),
    join(process.cwd(), 'dist', 'modules', 'auth', COMMON_PASSWORD_FILE),
    join(process.cwd(), 'src', 'modules', 'auth', COMMON_PASSWORD_FILE),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find ${COMMON_PASSWORD_FILE}.`);
}

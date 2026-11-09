/** How long a confirmation link stays alive. */
export const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

/** How long a password reset link stays alive. */
export const RESET_TTL_MS = 60 * 60 * 1000;

export const AUTH_TOKEN_PURPOSE = {
  emailVerification: 'email_verification',
  passwordReset: 'password_reset',
} as const;

export type AuthTokenPurpose =
  (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];

export const EMAIL_REQUEST_ACCEPTED =
  'If an account exists for that email, a message is on its way.';

export const EMAIL_UNAVAILABLE =
  "Email can't be sent right now. Try again later.";

export const INVALID_LINK = 'This link is invalid or has expired.';

/** Shared by login, account deletion, and signed-in password checks. */
export const INVALID_CREDENTIALS = 'Invalid credentials';

/** Signed-in password change submitted the password that is already set. */
export const PASSWORD_UNCHANGED =
  'New password must be different from the current password.';

/** An email change was requested without the current password. */
export const EMAIL_CHANGE_PASSWORD_REQUIRED =
  'Enter your current password to change your email.';

export const RATE_LIMIT_MESSAGE =
  'Too many requests. Wait a little, then try again.';

/** Per-address cap for forgot-password and resend. */
export const DEFAULT_RATE_LIMIT_ACCOUNT = 5;

/** Per-IP cap for the same endpoints. */
export const DEFAULT_RATE_LIMIT_IP = 20;

/** Sliding window for both caps. */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export const VERIFY_EMAIL_PATH = '/verify-email';
export const RESET_PASSWORD_PATH = '/reset-password';

import type { Request, Response } from 'express';
import { REFRESH_TTL_MS } from '../account.constants';

/** Host-only cookie. Path limits it to the auth routes that need it. */
export const REFRESH_COOKIE = 'prysmic_refresh';

export type RefreshCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/auth';
  maxAge?: number;
};

/**
 * www.prysmic.me and api.prysmic.me are same-site, so Lax is sent on the
 * credentialed fetch from the site to the API and withheld from other sites.
 * Secure is on in production only; local http would drop a Secure cookie.
 * No Domain attribute: the cookie stays on the API host.
 */
export function refreshCookieOptions(): RefreshCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
  };
}

export function setRefreshCookie(res: Response, raw: string): void {
  res.cookie(REFRESH_COOKIE, raw, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_TTL_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== REFRESH_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

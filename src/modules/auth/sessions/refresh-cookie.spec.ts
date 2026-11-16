import type { Request } from 'express';
import {
  REFRESH_COOKIE,
  readRefreshCookie,
  refreshCookieOptions,
} from './refresh-cookie';

describe('refresh cookie', () => {
  const previous = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previous;
  });

  it('is host-only, httpOnly, and Lax, and Secure only in production', () => {
    process.env.NODE_ENV = 'test';
    expect(refreshCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/auth',
    });
    process.env.NODE_ENV = 'production';
    expect(refreshCookieOptions().secure).toBe(true);
  });

  it('reads the refresh cookie and ignores a broken encoding', () => {
    const req = {
      headers: { cookie: 'other=1; prysmic_refresh=abc%2Fdef' },
    } as Request;
    expect(readRefreshCookie(req)).toBe('abc/def');
    expect(REFRESH_COOKIE).toBe('prysmic_refresh');

    const broken = {
      headers: { cookie: 'prysmic_refresh=%E0%A4%A' },
    } as Request;
    expect(readRefreshCookie(broken)).toBeNull();
    expect(readRefreshCookie({ headers: {} } as Request)).toBeNull();
  });
});

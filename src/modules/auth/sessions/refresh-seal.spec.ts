import { openRefreshSeal, sealRefreshToken } from './refresh-seal';

describe('refresh successor seal', () => {
  const secret = 'seal-test-secret';

  it('round-trips the successor and rejects a damaged seal or the wrong secret', () => {
    const raw = 'current-refresh-token';
    const sealed = sealRefreshToken(raw, secret);
    expect(sealed).not.toContain(raw);
    expect(openRefreshSeal(sealed, secret)).toBe(raw);
    expect(openRefreshSeal(sealed, 'other-secret')).toBeNull();
    expect(openRefreshSeal(`${sealed}x`, secret)).toBeNull();
    expect(openRefreshSeal('not-a-seal', secret)).toBeNull();
  });
});

import { VERCEL_PREVIEW_ORIGIN, corsOrigins } from './cors-origins';

const PREVIEW =
  'https://prysmic-frontend-git-cursor-guided-b20d80-v4runa-9390s-projects.vercel.app';

describe('Vercel preview CORS origins', () => {
  it('allows https preview hosts for this project', () => {
    expect(VERCEL_PREVIEW_ORIGIN.test(PREVIEW)).toBe(true);
    expect(
      VERCEL_PREVIEW_ORIGIN.test(
        'https://prysmic-frontend-x-v4runa-9390s-projects.vercel.app',
      ),
    ).toBe(true);
  });

  it('rejects look-alike hosts, other Vercel projects, and http', () => {
    const rejected = [
      'evil-prysmic-frontend-x-v4runa-9390s-projects.vercel.app.attacker.com',
      'https://evil-prysmic-frontend-x-v4runa-9390s-projects.vercel.app.attacker.com',
      'https://prysmic-frontend-x-v4runa-9390s-projects.vercel.app.attacker.com',
      'https://evil-prysmic-frontend-x-v4runa-9390s-projects.vercel.app',
      'prysmic-frontend-x-other-projects.vercel.app',
      'https://prysmic-frontend-x-other-projects.vercel.app',
      'https://other-app-x-v4runa-9390s-projects.vercel.app',
      'http://',
      'http://prysmic-frontend-x-v4runa-9390s-projects.vercel.app',
      'http://prysmic-frontend-git-cursor-guided-b20d80-v4runa-9390s-projects.vercel.app',
      'https://prysmic-frontend-x-v4runa-9390s-projects.vercel.app/',
      'https://prysmic-frontend-x-v4runa-9390s-projects.vercel.app:443',
      'https://prysmic-frontend-x-v4runa-9390s-projects.vercel.app.vercel.app',
    ];
    for (const origin of rejected) {
      expect(VERCEL_PREVIEW_ORIGIN.test(origin)).toBe(false);
    }
  });

  it('keeps FRONTEND_URL and localhost beside the preview pattern', () => {
    expect(corsOrigins(undefined)).toEqual([
      'http://localhost:3000',
      VERCEL_PREVIEW_ORIGIN,
    ]);
    expect(
      corsOrigins(' https://app.prysmic.me, https://prysmic.me , '),
    ).toEqual([
      'https://app.prysmic.me',
      'https://prysmic.me',
      'http://localhost:3000',
      VERCEL_PREVIEW_ORIGIN,
    ]);
  });
});

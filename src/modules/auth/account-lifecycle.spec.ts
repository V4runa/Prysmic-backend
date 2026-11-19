/* bcrypt's declared module and a few test doubles are intentionally loose. */

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EMAIL_UNAVAILABLE } from './account.constants';
import { AccountLifecycleService } from './account-lifecycle.service';
import { ConsoleEmailProvider } from './email/console-email.provider';
import { EmailDelivery } from './email/email.delivery';
import { createEmailProvider } from './email/email.provider.factory';
import { ResendEmailProvider } from './email/resend-email.provider';
import {
  renderAccountDeletedEmail,
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
} from './email/email.templates';
import { AuthService } from './auth.service';
import {
  AuthRateLimiter,
  RateLimitError,
  readPositiveInt,
  SlidingWindowRateLimiter,
} from './rate-limit';
import { sessionVersionMatches } from './session-version';
import { rowsFromQuery } from '../../database/query-rows';
import { clientIp } from './client-ip';
import { resolvePgBinDir } from '../../testing/pg-bin';
import { hashToken, tokenHashesEqual } from './tokens/token-hash';
import { User } from '../users/user.entity';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('account lifecycle units', () => {
  it('reads Postgres UPDATE RETURNING rows from the driver tuple', () => {
    const rows = [{ id: 4, userId: 9 }];
    expect(rowsFromQuery(rows)).toEqual(rows);
    expect(rowsFromQuery([rows, 1])).toEqual(rows);
    expect(rowsFromQuery([[], 0])).toEqual([]);
  });

  it('hashes tokens and compares them in constant time', () => {
    const digest = hashToken('a-raw-token');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain('a-raw-token');
    expect(tokenHashesEqual(digest, hashToken('a-raw-token'))).toBe(true);
    expect(tokenHashesEqual(digest, hashToken('another-token'))).toBe(false);
    expect(tokenHashesEqual('short', digest)).toBe(false);
  });

  it('treats missing session versions as the original generation', () => {
    expect(sessionVersionMatches(0, undefined)).toBe(true);
    expect(sessionVersionMatches(undefined, undefined)).toBe(true);
    expect(sessionVersionMatches(1, undefined)).toBe(false);
    expect(sessionVersionMatches(1, 1)).toBe(true);
    expect(sessionVersionMatches(2, 1)).toBe(false);
    expect(sessionVersionMatches(1, 1.5)).toBe(false);
    expect(sessionVersionMatches(-1, 0)).toBe(false);
  });

  it('reads the Railway client address before the proxy hop', () => {
    expect(
      clientIp({
        ip: '10.0.0.4',
        headers: { 'x-real-ip': '203.0.113.10' },
      }),
    ).toBe('203.0.113.10');
    expect(
      clientIp({
        ip: '::ffff:127.0.0.1',
        headers: { 'x-real-ip': [' 203.0.113.8 ', '10.1.1.1'] },
      }),
    ).toBe('203.0.113.8');
    expect(clientIp({ ip: '::ffff:192.0.2.4', headers: {} })).toBe('192.0.2.4');
    expect(clientIp({ ip: '192.0.2.5', headers: { 'x-real-ip': '   ' } })).toBe(
      '192.0.2.5',
    );
    expect(clientIp({ headers: {} })).toBe('unknown');
  });

  it('prefers PG_BIN_DIR and otherwise discovers a packaged install', () => {
    const exists = (path: string) =>
      path === '/custom/pg/initdb' ||
      path === '/usr/lib/postgresql/16/bin/initdb';
    expect(resolvePgBinDir({ PG_BIN_DIR: '/custom/pg' }, exists)).toBe(
      '/custom/pg',
    );
    expect(resolvePgBinDir({ PG_BIN_DIR: '/missing' }, exists)).toBe(
      '/usr/lib/postgresql/16/bin',
    );
    expect(
      resolvePgBinDir(
        {},
        (path) => path === '/opt/homebrew/bin/initdb',
        () => '/opt/homebrew/bin/initdb',
      ),
    ).toBe('/opt/homebrew/bin');
    expect(() => resolvePgBinDir({}, () => false)).toThrow(/PG_BIN_DIR/);
  });

  it('rate limits each key inside a sliding window', () => {
    let now = 1_000;
    const limiter = new SlidingWindowRateLimiter(() => now);
    expect(limiter.consume('email', 2, 1_000).allowed).toBe(true);
    expect(limiter.consume('email', 2, 1_000).allowed).toBe(true);
    const blocked = limiter.consume('email', 2, 1_000);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(limiter.consume('other', 2, 1_000).allowed).toBe(true);
    now += 1_001;
    expect(limiter.consume('email', 2, 1_000).allowed).toBe(true);
  });

  it('forgets expired keys and does not charge an email when the IP is blocked', () => {
    let now = 0;
    const window = new SlidingWindowRateLimiter(() => now);
    window.consume('old', 5, 1_000);
    now = 5_000;
    window.consume('fresh', 5, 1_000);
    expect(window.size()).toBe(1);

    const limiter = new AuthRateLimiter(
      config({
        AUTH_RATE_LIMIT_ACCOUNT: '2',
        AUTH_RATE_LIMIT_IP: '1',
        AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      }),
    );
    limiter.assert('password_reset', 'a@example.test', '203.0.113.1');
    expect(() =>
      limiter.assert('password_reset', 'b@example.test', '203.0.113.1'),
    ).toThrow(RateLimitError);
    limiter.assert('password_reset', 'b@example.test', '203.0.113.2');
    limiter.assert('password_reset', 'b@example.test', '203.0.113.3');
    expect(() =>
      limiter.assert('password_reset', 'b@example.test', '203.0.113.4'),
    ).toThrow(RateLimitError);
  });

  it('falls back when a rate-limit env value is unusable', () => {
    expect(readPositiveInt(undefined, 5)).toBe(5);
    expect(readPositiveInt('0', 5)).toBe(5);
    expect(readPositiveInt('nope', 5)).toBe(5);
    expect(readPositiveInt('8', 5)).toBe(8);
  });

  it('renders both parts of each letter with the link and a dark page', () => {
    const url = 'http://localhost:3000/verify-email?token=abc_DEF-123';
    const verification = renderVerificationEmail(url);
    const reset = renderPasswordResetEmail(
      'http://localhost:3000/reset-password?token=abc',
    );
    for (const letter of [verification, reset]) {
      expect(letter.text).toContain('http://localhost:3000/');
      expect(letter.html).toContain('http://localhost:3000/');
      expect(letter.html).toContain('background:#141311');
      expect(letter.html).not.toContain('{{');
      expect(letter.subject.length).toBeGreaterThan(0);
    }
    expect(verification.text).toContain('48 hours');
    expect(reset.text).toContain('one hour');

    const invitation = 'Reply to this email anytime. I read every one.';
    const farewell =
      'If you did not create an account, let this pass by. Nothing will change.';
    expect(verification.text.endsWith(invitation)).toBe(true);
    expect(verification.text.indexOf(farewell)).toBeLessThan(
      verification.text.indexOf(invitation),
    );
    expect(verification.html).toContain(invitation);
    expect(verification.html.indexOf(farewell)).toBeLessThan(
      verification.html.indexOf(invitation),
    );
    expect(verification.html).not.toContain('<img');
    expect(verification.html).not.toContain('utm_');
    for (const letter of [
      reset,
      renderPasswordChangedEmail(),
      renderAccountDeletedEmail(),
    ]) {
      expect(letter.text).not.toContain(invitation);
      expect(letter.html).not.toContain(invitation);
    }
  });

  it('selects Resend in production and the console provider otherwise', () => {
    const missing = createEmailProvider(config({ NODE_ENV: 'production' }));
    expect(missing).toBeInstanceOf(ResendEmailProvider);
    expect(missing.isConfigured()).toBe(false);

    const ready = createEmailProvider(
      config({
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'Prysmic <notes@prysmic.me>',
        APP_URL: 'https://www.prysmic.me',
      }),
    );
    expect(ready.isConfigured()).toBe(true);

    const local = createEmailProvider(config({ NODE_ENV: 'test' }));
    expect(local).toBeInstanceOf(ConsoleEmailProvider);
    expect(local.isConfigured()).toBe(true);
  });

  it('does not echo the provider body when Resend rejects a send', async () => {
    const provider = new ResendEmailProvider(
      're_secret_value',
      'Prysmic <notes@prysmic.me>',
      () =>
        Promise.resolve({
          ok: false,
          status: 422,
          text: () => Promise.resolve('leaked re_secret_value and user@x.test'),
        }),
    );
    await expect(
      provider.send({
        to: 'user@example.test',
        subject: 'Confirm your Prysmic email',
        html: '<p>hi</p>',
        text: 'hi',
      }),
    ).rejects.toThrow('Email send failed (422)');
  });

  it('posts the letter to Resend without putting the key in the error', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    const provider = new ResendEmailProvider(
      're_secret_value',
      'Prysmic <notes@prysmic.me>',
      (url, init) => {
        calls.push({
          url,
          body: init.body,
          auth: init.headers.Authorization,
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
        });
      },
    );
    await provider.send({
      to: 'user@example.test',
      subject: 'Reset your Prysmic password',
      html: '<p>link</p>',
      text: 'link',
    });
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].auth).toBe('Bearer re_secret_value');
    const payload = JSON.parse(calls[0].body) as {
      from: string;
      to: string[];
      reply_to: string;
      text: string;
    };
    expect(payload.from).toBe('Prysmic <notes@prysmic.me>');
    expect(payload.to).toEqual(['user@example.test']);
    expect(payload.reply_to).toBe('hello@prysmic.me');
    expect(payload.text).toBe('link');

    const bare = new ResendEmailProvider(undefined, undefined);
    await expect(
      bare.send({
        to: 'user@example.test',
        subject: 'x',
        html: 'x',
        text: 'x',
      }),
    ).rejects.toThrow('not configured');
  });

  it('sets reply_to on every letter and invites a reply only in the welcome email', async () => {
    const invitation = 'Reply to this email anytime. I read every one.';
    const letters = [
      renderVerificationEmail('https://www.prysmic.me/verify-email?token=abc'),
      renderPasswordResetEmail(
        'https://www.prysmic.me/reset-password?token=abc',
      ),
      renderPasswordChangedEmail(),
      renderAccountDeletedEmail(),
    ];
    const calls: string[] = [];
    const fetchImpl = (_url: string, init: { body: string }) => {
      calls.push(init.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });
    };
    const provider = new ResendEmailProvider(
      're_test',
      'Prysmic <notes@prysmic.me>',
      fetchImpl,
    );
    for (const letter of letters) {
      await provider.send({ to: 'reader@example.test', ...letter });
    }
    expect(calls).toHaveLength(letters.length);
    const payloads = calls.map((body) => resendPayload(body));
    expect(payloads.map((letter) => letter.subject)).toEqual(
      letters.map((letter) => letter.subject),
    );
    for (const payload of payloads) {
      expect(payload.from).toBe('Prysmic <notes@prysmic.me>');
      expect(payload.reply_to).toBe('hello@prysmic.me');
      expect(Object.keys(payload).sort()).toEqual([
        'from',
        'html',
        'reply_to',
        'subject',
        'text',
        'to',
      ]);
    }
    expect(payloads[0].text).toContain(invitation);
    expect(payloads[0].html).toContain(invitation);
    expect(payloads[0].html).not.toContain('<img');
    expect(payloads[0].html).not.toContain('utm_');
    for (const payload of payloads.slice(1)) {
      expect(payload.text).not.toContain(invitation);
      expect(payload.html).not.toContain(invitation);
    }

    calls.length = 0;
    const custom = new ResendEmailProvider(
      're_test',
      'Prysmic <notes@prysmic.me>',
      fetchImpl,
      '  inbox@prysmic.me  ',
    );
    await custom.send({ to: 'reader@example.test', ...letters[1] });
    expect(resendPayload(calls[0]).reply_to).toBe('inbox@prysmic.me');

    calls.length = 0;
    const blank = new ResendEmailProvider(
      're_test',
      'Prysmic <notes@prysmic.me>',
      fetchImpl,
      '  ',
    );
    await blank.send({ to: 'reader@example.test', ...letters[2] });
    expect(resendPayload(calls[0]).reply_to).toBe('hello@prysmic.me');

    const injected = new ResendEmailProvider(
      're_test',
      'Prysmic <notes@prysmic.me>',
      fetchImpl,
      'hello@prysmic.me\nBcc: eve@example.test',
    );
    await expect(
      injected.send({ to: 'reader@example.test', ...letters[3] }),
    ).rejects.toThrow('invalid address');
    expect(calls).toHaveLength(1);
  });

  it('reads EMAIL_REPLY_TO when production mail is sent', async () => {
    const calls: string[] = [];
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(((
      _url: string,
      init?: { body?: string },
    ) => {
      calls.push(init?.body ?? '');
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });
    }) as typeof fetch);
    try {
      const custom = createEmailProvider(
        config({
          NODE_ENV: 'production',
          RESEND_API_KEY: 're_test',
          EMAIL_FROM: 'Prysmic <notes@prysmic.me>',
          EMAIL_REPLY_TO: 'owner@prysmic.me',
        }),
      );
      await custom.send({
        to: 'reader@example.test',
        subject: 'Confirm your Prysmic email',
        html: '<p>hi</p>',
        text: 'hi',
      });
      const omitted = createEmailProvider(
        config({
          NODE_ENV: 'production',
          RESEND_API_KEY: 're_test',
          EMAIL_FROM: 'Prysmic <notes@prysmic.me>',
        }),
      );
      await omitted.send({
        to: 'reader@example.test',
        subject: 'Reset your Prysmic password',
        html: '<p>hi</p>',
        text: 'hi',
      });
    } finally {
      fetchMock.mockRestore();
    }
    const customPayload = resendPayload(calls[0]);
    const defaultPayload = resendPayload(calls[1]);
    expect(customPayload.reply_to).toBe('owner@prysmic.me');
    expect(customPayload.from).toBe('Prysmic <notes@prysmic.me>');
    expect(defaultPayload.reply_to).toBe('hello@prysmic.me');
  });

  it('refuses to send when production email is not configured', () => {
    const delivery = new EmailDelivery(
      new ResendEmailProvider(undefined, undefined),
      config({ NODE_ENV: 'production' }),
    );
    expect(() => delivery.assertReady()).toThrow(ServiceUnavailableException);
    try {
      delivery.assertReady();
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).message).toBe(
        EMAIL_UNAVAILABLE,
      );
    }
  });

  it('fails a reset request before looking up the account when email is down', () => {
    const findUsersByEmail = jest.fn();
    const service = new AccountLifecycleService(
      { findUsersByEmail } as never,
      {} as never,
      new EmailDelivery(
        new ResendEmailProvider(undefined, undefined),
        config({ NODE_ENV: 'production' }),
      ),
      { assert: () => undefined } as never,
      {} as never,
      { revokeAllForUser: () => Promise.resolve() } as never,
    );
    expect(() =>
      service.requestPasswordReset('known@example.test', '127.0.0.1'),
    ).toThrow(EMAIL_UNAVAILABLE);
    expect(() =>
      service.requestPasswordReset('missing@example.test', '127.0.0.1'),
    ).toThrow(EMAIL_UNAVAILABLE);
    expect(findUsersByEmail).not.toHaveBeenCalled();
  });

  it('logs in the account whose password matches when email and username collide', async () => {
    const passwordA = 'alpha-passphrase';
    const passwordB = 'beta-passphrase';
    const hashA = await bcrypt.hash(passwordA, 4);
    const hashB = await bcrypt.hash(passwordB, 4);
    const emailOwner = user(1, 'keeper', 'keeper@example.test', hashA);
    const usernameOwner = user(
      2,
      'keeper@example.test',
      'other@example.test',
      hashB,
    );
    const auth = new AuthService(
      {
        findByUsernameForAuth: (identifier: string) =>
          Promise.resolve(
            identifier === usernameOwner.username ? usernameOwner : null,
          ),
        findByEmailForAuth: (identifier: string) =>
          Promise.resolve(
            identifier.toLowerCase() === emailOwner.email ? emailOwner : null,
          ),
      } as never,
      new JwtService({ secret: 'unit-secret' }),
      { seedDefaultMoods: () => Promise.resolve() } as never,
      { sendVerificationEmail: () => Promise.resolve() } as never,
      { issue: () => Promise.resolve('refresh-raw') } as never,
    );

    const asEmailOwner = await auth.login({
      identifier: 'keeper@example.test',
      password: passwordA,
    });
    expect(sessionSub(asEmailOwner.access_token)).toBe(1);

    const asUsernameOwner = await auth.login({
      identifier: 'keeper@example.test',
      password: passwordB,
    });
    expect(sessionSub(asUsernameOwner.access_token)).toBe(2);

    usernameOwner.password = hashA;
    await expect(
      auth.login({
        identifier: 'keeper@example.test',
        password: passwordA,
      }),
    ).rejects.toThrow('Invalid credentials');
  });
});

function user(
  id: number,
  username: string,
  email: string,
  password: string,
): User {
  return {
    id,
    username,
    email,
    password,
    emailVerified: true,
    sessionVersion: 0,
  } as User;
}

function resendPayload(body: string): {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
} {
  return JSON.parse(body) as {
    from: string;
    to: string[];
    reply_to: string;
    subject: string;
    html: string;
    text: string;
  };
}

function sessionSub(token: string): number {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: number };
  return payload.sub;
}

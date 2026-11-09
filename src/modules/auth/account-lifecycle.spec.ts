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
  renderPasswordResetEmail,
  renderVerificationEmail,
} from './email/email.templates';
import { AuthService } from './auth.service';
import { readPositiveInt, SlidingWindowRateLimiter } from './rate-limit';
import { sessionVersionMatches } from './session-version';
import { rowsFromQuery } from '../../database/query-rows';
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
      text: string;
    };
    expect(payload.from).toBe('Prysmic <notes@prysmic.me>');
    expect(payload.to).toEqual(['user@example.test']);
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

  it('fails a reset request before looking up the account when email is down', async () => {
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
    );
    await expect(
      service.requestPasswordReset('known@example.test', '127.0.0.1'),
    ).rejects.toThrow(EMAIL_UNAVAILABLE);
    await expect(
      service.requestPasswordReset('missing@example.test', '127.0.0.1'),
    ).rejects.toThrow(EMAIL_UNAVAILABLE);
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
        findByUsername: (identifier: string) =>
          Promise.resolve(
            identifier === usernameOwner.username ? usernameOwner : null,
          ),
        findByEmail: (identifier: string) =>
          Promise.resolve(
            identifier.toLowerCase() === emailOwner.email ? emailOwner : null,
          ),
      } as never,
      new JwtService({ secret: 'unit-secret' }),
      { seedSampleData: () => Promise.resolve() } as never,
      { sendVerificationEmail: () => Promise.resolve() } as never,
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

function sessionSub(token: string): number {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: number };
  return payload.sub;
}

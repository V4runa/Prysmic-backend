/* In-memory rows and supertest bodies are loose by design. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  EMAIL_CHANGE_PASSWORD_REQUIRED,
  INVALID_CREDENTIALS,
  PASSWORD_UNCHANGED,
} from './account.constants';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { EmailProvider, OutboundEmail } from './email/email.types';
import { EmailDelivery } from './email/email.delivery';
import { EMAIL_PROVIDER } from './email/email.provider.factory';
import { PASSWORD_CHANGED_SUBJECT } from './email/email.templates';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { AuthRateLimiter } from './rate-limit';
import { AuthToken } from './tokens/auth-token.entity';
import { AuthTokenService } from './tokens/auth-token.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { User } from '../users/user.entity';
import { UserController } from '../users/user.controller';
import { UserService } from '../users/user.service';

const TEST_JWT_SECRET = 'test-only-password-change-secret';

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
  emailVerified: boolean;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type Revocation = { userId: number; purpose: string };

class RecordingProvider implements EmailProvider {
  readonly sent: OutboundEmail[] = [];
  configured = true;
  fail = false;

  isConfigured(): boolean {
    return this.configured;
  }

  send(message: OutboundEmail): Promise<void> {
    if (this.fail) return Promise.reject(new Error('provider down'));
    this.sent.push(message);
    return Promise.resolve();
  }
}

function createMemory() {
  const users: StoredUser[] = [];
  const revoked: Revocation[] = [];
  let seq = 0;

  const repo = {
    create(partial: Partial<StoredUser>): StoredUser {
      return {
        id: 0,
        username: '',
        email: '',
        password: '',
        emailVerified: false,
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
      };
    },
    async save(user: StoredUser): Promise<StoredUser> {
      if (!user.id) {
        seq += 1;
        user.id = seq;
        users.push(user);
        return user;
      }
      const existing = users.find((row) => row.id === user.id);
      if (existing) {
        Object.assign(existing, user, { updatedAt: new Date() });
        return existing;
      }
      users.push(user);
      return user;
    },
    async find(options?: {
      where?: { id?: unknown; email?: string; username?: string };
    }): Promise<StoredUser[]> {
      const where = options?.where;
      if (!where) return users.map((row) => ({ ...row }));
      return users
        .filter((row) =>
          where.id === undefined ? true : row.id === Number(where.id),
        )
        .filter((row) => (where.email ? row.email === where.email : true))
        .filter((row) =>
          where.username ? row.username === where.username : true,
        )
        .map((row) => ({ ...row }));
    },
    async findOne(options?: {
      where?: { id?: unknown; email?: string; username?: string };
    }): Promise<StoredUser | null> {
      const rows = await repo.find(options);
      return rows[0] ?? null;
    },
    manager: {
      async query(sql: string, params: unknown[] = []): Promise<unknown> {
        if (!sql.includes('SET "password"')) return [[], 0];
        const user = users.find((row) => row.id === Number(params[1]));
        if (!user) return [[], 0];
        user.password = String(params[0]);
        user.sessionVersion += 1;
        user.updatedAt = new Date();
        return [
          [
            {
              id: user.id,
              username: user.username,
              email: user.email,
              emailVerified: user.emailVerified === true,
              sessionVersion: user.sessionVersion,
            },
          ],
          1,
        ];
      },
    },
  };

  const tokens = {
    manager: {
      async query(sql: string, params: unknown[] = []): Promise<unknown> {
        if (sql.includes('auth_tokens')) {
          revoked.push({
            userId: Number(params[0]),
            purpose: String(params[1]),
          });
        }
        return [[], 0];
      },
    },
  };

  return { repo, tokens, users, revoked };
}

describe('signed-in password change and email change', () => {
  let app: INestApplication;
  let users: StoredUser[];
  let revoked: Revocation[];
  const mailbox = new RecordingProvider();
  const issue = jest.fn().mockResolvedValue('fresh-verify-token');

  beforeAll(async () => {
    const memory = createMemory();
    users = memory.users;
    revoked = memory.revoked;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              JWT_SECRET: TEST_JWT_SECRET,
              APP_URL: 'http://localhost:3000',
              NODE_ENV: 'test',
              AUTH_RATE_LIMIT_ACCOUNT: 2,
              AUTH_RATE_LIMIT_IP: 100,
              AUTH_RATE_LIMIT_WINDOW_MS: 600000,
            }),
          ],
        }),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController, UserController],
      providers: [
        AuthService,
        UserService,
        AccountLifecycleService,
        AuthRateLimiter,
        EmailDelivery,
        JwtStrategy,
        JwtAuthGuard,
        { provide: EMAIL_PROVIDER, useValue: mailbox },
        { provide: AuthTokenService, useValue: { issue } },
        { provide: DataSource, useValue: {} },
        {
          provide: OnboardingService,
          useValue: { seedSampleData: () => Promise.resolve() },
        },
        { provide: getRepositoryToken(User), useValue: memory.repo },
        { provide: getRepositoryToken(AuthToken), useValue: memory.tokens },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    mailbox.sent.length = 0;
    mailbox.configured = true;
    mailbox.fail = false;
    revoked.length = 0;
    issue.mockClear();
    app.get(AuthRateLimiter).clear();
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function settle(): Promise<void> {
    await app.get(AccountLifecycleService).settleMail();
  }

  async function signup(username: string, email: string, password: string) {
    const response = await request(server())
      .post('/auth/signup')
      .send({ username, email, password });
    expect(response.status).toBe(201);
    await settle();
    mailbox.sent.length = 0;
    issue.mockClear();
    const user = users.find((row) => row.email === email.toLowerCase());
    if (!user) throw new Error(`missing ${email}`);
    return { token: response.body.access_token as string, user };
  }

  function payloadOf(token: string): { sub: number; sv: number } {
    const segment = token.split('.')[1];
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  }

  it('replaces the password, returns a login-shaped token, and signs out other sessions', async () => {
    const { token, user } = await signup(
      'changer-name',
      'changer@example.test',
      'original-passphrase',
    );
    const second = await request(server()).post('/auth/login').send({
      identifier: 'changer@example.test',
      password: 'original-passphrase',
    });
    expect(second.status).toBe(201);
    user.emailVerified = true;

    const changed = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'original-passphrase',
        newPassword: 'replacement-passphrase',
      });
    expect(changed.status).toBe(200);
    expect(Object.keys(changed.body).sort()).toEqual([
      'access_token',
      'emailVerified',
    ]);
    expect(changed.body.emailVerified).toBe(true);
    const fresh = changed.body.access_token as string;
    expect(payloadOf(fresh)).toMatchObject({ sub: user.id, sv: 1 });
    expect(payloadOf(token).sv).toBe(0);
    expect(JSON.stringify(changed.body)).not.toContain(
      'replacement-passphrase',
    );
    expect(JSON.stringify(changed.body)).not.toContain(user.password);

    expect(
      (await request(server()).get('/users').set(auth(token))).status,
    ).toBe(401);
    expect(
      (
        await request(server())
          .get('/users')
          .set(auth(second.body.access_token as string))
      ).status,
    ).toBe(401);
    const kept = await request(server()).get('/users').set(auth(fresh));
    expect(kept.status).toBe(200);
    expect(kept.body[0]).toMatchObject({
      id: user.id,
      email: 'changer@example.test',
      emailVerified: true,
    });
    expect(kept.body[0].password).toBeUndefined();

    const oldLogin = await request(server()).post('/auth/login').send({
      identifier: 'changer-name',
      password: 'original-passphrase',
    });
    const newLogin = await request(server()).post('/auth/login').send({
      identifier: 'changer@example.test',
      password: 'replacement-passphrase',
    });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(201);
    expect(user.sessionVersion).toBe(1);
    expect(user.emailVerified).toBe(true);
    expect(await bcrypt.compare('replacement-passphrase', user.password)).toBe(
      true,
    );

    await settle();
    expect(mailbox.sent).toHaveLength(1);
    expect(mailbox.sent[0].to).toBe('changer@example.test');
    expect(mailbox.sent[0].subject).toBe(PASSWORD_CHANGED_SUBJECT);
    expect(mailbox.sent[0].text).toContain('Your password was changed');
    expect(mailbox.sent[0].text).not.toContain('replacement-passphrase');
    expect(mailbox.sent[0].html).not.toContain('href=');
  });

  it('keeps an unverified address unverified and skips the notice', async () => {
    const { token, user } = await signup(
      'quiet-name',
      'quiet@example.test',
      'quiet-passphrase',
    );
    const changed = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'quiet-passphrase',
        newPassword: 'quiet-replacement',
      });
    expect(changed.status).toBe(200);
    expect(changed.body.emailVerified).toBe(false);
    expect(user.emailVerified).toBe(false);
    await settle();
    expect(mailbox.sent).toHaveLength(0);
    const kept = await request(server())
      .get('/users')
      .set(auth(changed.body.access_token as string));
    expect(kept.body[0].emailVerified).toBe(false);
  });

  it('rejects a missing token, a wrong password, the same password, and a policy failure without storing it', async () => {
    const { token, user } = await signup(
      'guarded-name',
      'guarded@example.test',
      'guarded-passphrase',
    );
    const hashBefore = user.password;

    const anonymous = await request(server())
      .post('/auth/password/change')
      .send({
        currentPassword: 'guarded-passphrase',
        newPassword: 'another-passphrase',
      });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.message).toBe(
      'Unauthorized: Invalid or missing token',
    );

    const extra = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'guarded-passphrase',
        newPassword: 'another-passphrase',
        password: 'another-passphrase',
      });
    expect(extra.status).toBe(400);

    const wrong = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'not-the-passphrase',
        newPassword: 'another-passphrase',
      });
    const loginWrong = await request(server()).post('/auth/login').send({
      identifier: 'nobody-guarded@example.test',
      password: 'not-the-passphrase',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(loginWrong.body);
    expect(wrong.body.message).toBe(INVALID_CREDENTIALS);

    const same = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'guarded-passphrase',
        newPassword: 'guarded-passphrase',
      });
    expect(same.status).toBe(400);
    expect(same.body.message).toBe(PASSWORD_UNCHANGED);

    app.get(AuthRateLimiter).clear();
    const short = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'guarded-passphrase',
        newPassword: 'short',
      });
    expect(short.status).toBe(400);
    expect(short.body.message).toBe('Password must be at least 8 characters.');
    const personal = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'guarded-passphrase',
        newPassword: 'guarded-name',
      });
    expect(personal.status).toBe(400);
    expect(personal.body.message).toBe('Password cannot be your username.');

    expect(user.password).toBe(hashBefore);
    expect(user.sessionVersion).toBe(0);
    const still = await request(server()).get('/users').set(auth(token));
    expect(still.status).toBe(200);
    expect(JSON.stringify(same.body)).not.toContain('guarded-passphrase');
    expect(JSON.stringify(short.body)).not.toContain(hashBefore);
  });

  it('rate limits repeated password guesses and still accepts a later good change', async () => {
    const { token, user } = await signup(
      'limited-name',
      'limited@example.test',
      'limited-passphrase',
    );
    const hashBefore = user.password;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const wrong = await request(server())
        .post('/auth/password/change')
        .set(auth(token))
        .send({
          currentPassword: `guess-${attempt}-passphrase`,
          newPassword: 'another-passphrase',
        });
      expect(wrong.status).toBe(401);
    }
    const blocked = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'limited-passphrase',
        newPassword: 'another-passphrase',
      });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      'Too many requests. Wait a little, then try again.',
    );
    expect(blocked.headers['retry-after']).toEqual(expect.any(String));
    expect(user.password).toBe(hashBefore);

    app.get(AuthRateLimiter).clear();
    const changed = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'limited-passphrase',
        newPassword: 'another-passphrase',
      });
    expect(changed.status).toBe(200);
    expect(await bcrypt.compare('another-passphrase', user.password)).toBe(
      true,
    );
  });

  it('still changes the password when the notice cannot be sent', async () => {
    const { token, user } = await signup(
      'offline-name',
      'offline@example.test',
      'offline-passphrase',
    );
    user.emailVerified = true;
    mailbox.fail = true;
    const failed = await request(server())
      .post('/auth/password/change')
      .set(auth(token))
      .send({
        currentPassword: 'offline-passphrase',
        newPassword: 'offline-replacement',
      });
    expect(failed.status).toBe(200);
    await expect(settle()).resolves.toBeUndefined();
    expect(mailbox.sent).toHaveLength(0);
    expect(await bcrypt.compare('offline-replacement', user.password)).toBe(
      true,
    );

    mailbox.fail = false;
    const { token: quietToken, user: quiet } = await signup(
      'unconfigured-name',
      'unconfigured@example.test',
      'unconfigured-passphrase',
    );
    quiet.emailVerified = true;
    mailbox.configured = false;
    mailbox.fail = false;
    const quietChange = await request(server())
      .post('/auth/password/change')
      .set(auth(quietToken))
      .send({
        currentPassword: 'unconfigured-passphrase',
        newPassword: 'unconfigured-replacement',
      });
    expect(quietChange.status).toBe(200);
    await settle();
    expect(mailbox.sent).toHaveLength(0);
    expect(
      await bcrypt.compare('unconfigured-replacement', quiet.password),
    ).toBe(true);
  });

  it('requires the current password only when the email changes, then confirms the new address', async () => {
    const alpha = await signup(
      'alpha-name',
      'alpha@example.test',
      'alpha-passphrase',
    );
    const beta = await signup(
      'beta-name',
      'beta@example.test',
      'beta-passphrase',
    );
    alpha.user.emailVerified = true;

    const renamed = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({
        username: 'alpha-renamed',
        currentPassword: 'not-the-passphrase',
      });
    expect(renamed.status).toBe(200);
    expect(renamed.body.username).toBe('alpha-renamed');
    expect(renamed.body.email).toBe('alpha@example.test');
    expect(alpha.user.emailVerified).toBe(true);
    expect(revoked).toHaveLength(0);
    expect(issue).not.toHaveBeenCalled();

    const sameAddress = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({ email: 'ALPHA@example.test' });
    expect(sameAddress.status).toBe(200);
    expect(sameAddress.body.email).toBe('alpha@example.test');
    expect(alpha.user.emailVerified).toBe(true);

    const missing = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({ email: 'alpha-next@example.test' });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe(EMAIL_CHANGE_PASSWORD_REQUIRED);
    expect(alpha.user.email).toBe('alpha@example.test');

    const wrong = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({
        email: beta.user.email,
        username: 'should-not-stick',
        currentPassword: 'not-the-passphrase',
      });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe(INVALID_CREDENTIALS);
    expect(alpha.user.email).toBe('alpha@example.test');
    expect(alpha.user.username).toBe('alpha-renamed');

    const takenEmail = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({
        email: 'beta@example.test',
        username: 'alpha-still',
        currentPassword: 'alpha-passphrase',
      });
    expect(takenEmail.status).toBe(409);
    expect(takenEmail.body.message).toBe('Email already in use!');
    expect(alpha.user.email).toBe('alpha@example.test');
    expect(alpha.user.username).toBe('alpha-renamed');

    const takenName = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({ username: 'beta-name' });
    expect(takenName.status).toBe(409);
    expect(takenName.body.message).toBe('Username already taken!');

    app.get(AuthRateLimiter).clear();
    const foreign = await request(server())
      .put(`/users/${beta.user.id}`)
      .set(auth(alpha.token))
      .send({
        email: 'stolen@example.test',
        currentPassword: 'alpha-passphrase',
      });
    expect(foreign.status).toBe(404);
    expect(foreign.body.message).toBe('User not found');
    expect(beta.user.email).toBe('beta@example.test');

    const moved = await request(server())
      .put(`/users/${alpha.user.id}`)
      .set(auth(alpha.token))
      .send({
        email: 'alpha-next@example.test',
        username: 'alpha-next-name',
        currentPassword: 'alpha-passphrase',
      });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      id: alpha.user.id,
      email: 'alpha-next@example.test',
      username: 'alpha-next-name',
      emailVerified: false,
    });
    expect(moved.body.password).toBeUndefined();
    expect(await bcrypt.compare('alpha-passphrase', alpha.user.password)).toBe(
      true,
    );
    expect(alpha.user.sessionVersion).toBe(0);
    expect(revoked).toEqual([
      { userId: alpha.user.id, purpose: 'email_verification' },
    ]);
    await settle();
    expect(issue).toHaveBeenCalledTimes(1);
    expect(mailbox.sent).toHaveLength(1);
    expect(mailbox.sent[0].to).toBe('alpha-next@example.test');
    expect(mailbox.sent[0].subject).toBe('Confirm your Prysmic email');
    expect(mailbox.sent[0].text).toContain('token=fresh-verify-token');
    expect(mailbox.sent[0].text).not.toContain('alpha-passphrase');

    const stillSignedIn = await request(server())
      .get('/users')
      .set(auth(alpha.token));
    expect(stillSignedIn.status).toBe(200);
    expect(stillSignedIn.body[0].email).toBe('alpha-next@example.test');
    expect(stillSignedIn.body[0].emailVerified).toBe(false);
  });

  it('rate limits wrong passwords on an email change', async () => {
    const { token, user } = await signup(
      'capped-name',
      'capped@example.test',
      'capped-passphrase',
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const wrong = await request(server())
        .put(`/users/${user.id}`)
        .set(auth(token))
        .send({
          email: 'capped-next@example.test',
          currentPassword: `guess-${attempt}-passphrase`,
        });
      expect(wrong.status).toBe(401);
    }
    const blocked = await request(server())
      .put(`/users/${user.id}`)
      .set(auth(token))
      .send({
        email: 'capped-next@example.test',
        currentPassword: 'capped-passphrase',
      });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toEqual(expect.any(String));
    expect(user.email).toBe('capped@example.test');
    expect(revoked).toHaveLength(0);
  });
});

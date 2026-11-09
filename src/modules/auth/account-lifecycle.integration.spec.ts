/* Supertest bodies and the dynamic migration loader are loose by design. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request, { type Response } from 'supertest';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { AppModule } from '../../app.module';
import { EMAIL_REQUEST_ACCEPTED, INVALID_LINK } from './account.constants';
import { ConsoleEmailProvider } from './email/console-email.provider';
import { EMAIL_PROVIDER } from './email/email.provider.factory';
import type { EmailProvider, OutboundEmail } from './email/email.types';
import { AuthRateLimiter } from './rate-limit';
import { hashToken } from './tokens/token-hash';

const PG = '/usr/lib/postgresql/16/bin';
const PORT = 54348;
const DATA_DIR = '/tmp/prysmic-lifecycle-pg';
const LOG = '/tmp/prysmic-lifecycle-pg.log';
const DATABASE = 'prysmic_lifecycle';
const DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/${DATABASE}`;

const LEGACY_EMAIL = 'legacy@example.test';
const LEGACY_PASSWORD = 'legacy-passphrase';
const KEPT_NOTE = 'do not lose this kept note';

jest.setTimeout(120000);

describe('account lifecycle against disposable Postgres', () => {
  let admin: DataSource;
  let app: INestApplication;
  let legacyId = 0;
  let legacyHash = '';
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_SSL: process.env.DB_SSL,
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    APP_URL: process.env.APP_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    AUTH_RATE_LIMIT_ACCOUNT: process.env.AUTH_RATE_LIMIT_ACCOUNT,
    AUTH_RATE_LIMIT_IP: process.env.AUTH_RATE_LIMIT_IP,
    AUTH_RATE_LIMIT_WINDOW_MS: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    DB_LOGGING: process.env.DB_LOGGING,
  };

  beforeAll(async () => {
    const host = new URL(DATABASE_URL).hostname;
    if (host !== '127.0.0.1') {
      throw new Error(`Refusing non-local database host ${host}`);
    }
    startPostgres();
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DB_SSL = 'false';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'lifecycle-integration-secret';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.AUTH_RATE_LIMIT_ACCOUNT = '3';
    process.env.AUTH_RATE_LIMIT_IP = '4';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '600000';
    process.env.DB_LOGGING = 'false';
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    admin = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: PORT,
      username: 'postgres',
      database: DATABASE,
      synchronize: false,
      logging: false,
    });
    await admin.initialize();

    const migrations = await loadMigrations();
    const lifecycle = migrations.find((migration) =>
      migrationName(migration).includes('AddAccountLifecycle'),
    );
    if (!lifecycle) throw new Error('lifecycle migration was not loaded');
    const earlier = migrations.filter((migration) => migration !== lifecycle);
    for (const migration of earlier) {
      await apply(admin, migration, 'up');
    }

    legacyHash = await bcrypt.hash(LEGACY_PASSWORD, 10);
    const inserted = await admin.query(
      `INSERT INTO "users" ("username", "email", "password")
       VALUES ($1, $2, $3) RETURNING "id", "password"`,
      ['legacy-keeper', LEGACY_EMAIL, legacyHash],
    );
    legacyId = inserted[0].id;
    await admin.query(
      `INSERT INTO "notes" ("title", "content", "userId", "isPinned", "isArchived")
       VALUES ($1, $2, $3, false, false)`,
      ['Kept', KEPT_NOTE, legacyId],
    );

    await admin.query(`
      CREATE TABLE IF NOT EXISTS "migrations" (
        "id" SERIAL NOT NULL,
        "timestamp" bigint NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
      )
    `);
    for (const migration of earlier) {
      const name = migrationName(migration);
      const timestamp = Number.parseInt(name.slice(-13), 10);
      await admin.query(
        `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
        [timestamp, name],
      );
    }

    ensureBuilt();
    const ran = spawnSync(
      'node',
      [
        './node_modules/typeorm/cli.js',
        'migration:run',
        '-d',
        'dist/data-source.js',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL,
          DB_SSL: 'false',
          NODE_ENV: 'test',
        },
      },
    );
    if (ran.status !== 0) {
      throw new Error(
        `migration:run:prod failed\n${ran.stdout}\n${ran.stderr}`,
      );
    }

    const grandfathered = await admin.query(
      `SELECT "emailVerified", "password", "sessionVersion" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(grandfathered[0].emailVerified).toBe(true);
    expect(grandfathered[0].password).toBe(legacyHash);
    expect(Number(grandfathered[0].sessionVersion)).toBe(0);
    const kept = await admin.query(
      `SELECT "content" FROM "notes" WHERE "userId" = $1`,
      [legacyId],
    );
    expect(kept.map((row) => row.content)).toContain(KEPT_NOTE);

    await apply(admin, lifecycle, 'down');
    const dropped = await admin.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'emailVerified'`,
    );
    expect(dropped).toHaveLength(0);
    const stillThere = await admin.query(
      `SELECT "password" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(stillThere[0].password).toBe(legacyHash);
    const noteAfterDown = await admin.query(
      `SELECT "content" FROM "notes" WHERE "userId" = $1 AND "content" = $2`,
      [legacyId, KEPT_NOTE],
    );
    expect(noteAfterDown).toHaveLength(1);

    await apply(admin, lifecycle, 'up');
    const restored = await admin.query(
      `SELECT "emailVerified", "password" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(restored[0].emailVerified).toBe(true);
    expect(restored[0].password).toBe(legacyHash);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();
    remember(app);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    if (admin?.isInitialized) await admin.destroy();
    spawnSync(`${PG}/pg_ctl`, ['-D', DATA_DIR, '-w', 'stop']);
    spawnSync('rm', ['-rf', DATA_DIR]);
    restoreEnv(previousEnv);
  });

  beforeEach(() => {
    mailbox().clear();
    app.get(AuthRateLimiter).clear();
  });

  it('lets a grandfathered account sign in as already verified', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: LEGACY_EMAIL, password: LEGACY_PASSWORD });
    expect(login.status).toBe(201);
    expect(login.body.emailVerified).toBe(true);
    expect(JSON.stringify(login.body)).not.toContain(legacyHash);
    expect(JSON.stringify(login.body)).not.toContain(LEGACY_PASSWORD);

    const profile = await request(server())
      .get('/users')
      .set(auth(login.body.access_token as string));
    expect(profile.status).toBe(200);
    expect(profile.body[0].emailVerified).toBe(true);
    expect(profile.body[0].email).toBe(LEGACY_EMAIL);
    expect(JSON.stringify(profile.body)).not.toContain(legacyHash);
  });

  it('verifies a new account without blocking login, once', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'new-wanderer',
      email: 'Wanderer@example.test',
      password: 'wander-passphrase',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.emailVerified).toBe(false);
    expect(signup.body.password).toBeUndefined();
    expect(JSON.stringify(signup.body)).not.toContain('wander-passphrase');

    const unverified = await request(server()).post('/auth/login').send({
      identifier: 'wanderer@example.test',
      password: 'wander-passphrase',
    });
    expect(unverified.status).toBe(201);
    expect(unverified.body.emailVerified).toBe(false);
    const token = unverified.body.access_token as string;
    const before = await request(server()).get('/users').set(auth(token));
    expect(before.body[0].email).toBe('wanderer@example.test');
    expect(before.body[0].emailVerified).toBe(false);

    const linkToken = tokenFrom(onlyEmail());
    const rows = await admin.query(
      `SELECT "tokenHash" FROM "auth_tokens" WHERE "userId" = $1`,
      [before.body[0].id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(linkToken));
    expect(rows[0].tokenHash).not.toContain(linkToken);

    const confirmed = await request(server())
      .post('/auth/email/verify')
      .send({ token: linkToken });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ emailVerified: true });
    expect(JSON.stringify(confirmed.body)).not.toContain(linkToken);

    const again = await request(server())
      .post('/auth/email/verify')
      .send({ token: linkToken });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe(INVALID_LINK);
    expect(JSON.stringify(again.body)).not.toContain(linkToken);

    const after = await request(server()).get('/users').set(auth(token));
    expect(after.status).toBe(200);
    expect(after.body[0].emailVerified).toBe(true);
    const relogin = await request(server()).post('/auth/login').send({
      identifier: 'Wanderer@example.test',
      password: 'wander-passphrase',
    });
    expect(relogin.body.emailVerified).toBe(true);
  });

  it('rejects an expired verification link and keeps the account unverified', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'late-wanderer',
      email: 'late@example.test',
      password: 'late-passphrase',
    });
    expect(signup.status).toBe(201);
    const linkToken = tokenFrom(onlyEmail());
    await admin.query(
      `UPDATE "auth_tokens" SET "expiresAt" = NOW() - interval '1 minute'
       WHERE "tokenHash" = $1`,
      [hashToken(linkToken)],
    );
    const confirmed = await request(server())
      .post('/auth/email/verify')
      .send({ token: linkToken });
    expect(confirmed.status).toBe(400);
    expect(confirmed.body.message).toBe(INVALID_LINK);
    const login = await request(server()).post('/auth/login').send({
      identifier: 'late@example.test',
      password: 'late-passphrase',
    });
    expect(login.body.emailVerified).toBe(false);
  });

  it('answers resend the same way whether or not the account exists', async () => {
    await request(server()).post('/auth/signup').send({
      username: 'resend-wanderer',
      email: 'resend@example.test',
      password: 'resend-passphrase',
    });
    mailbox().clear();
    const known = await request(server())
      .post('/auth/email/resend')
      .send({ email: 'resend@example.test' });
    const unknown = await request(server())
      .post('/auth/email/resend')
      .send({ email: 'nobody-resend@example.test' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(known.body).toEqual({ message: EMAIL_REQUEST_ACCEPTED });
    expect(JSON.stringify(unknown.body)).not.toContain('resend@example.test');
    expect(mailbox().outbox).toHaveLength(1);
    expect(mailbox().outbox[0].to).toBe('resend@example.test');

    const token = tokenFrom(onlyEmail());
    await request(server()).post('/auth/email/verify').send({ token });
    mailbox().clear();
    const verified = await request(server())
      .post('/auth/email/resend')
      .send({ email: 'resend@example.test' });
    expect(verified.body).toEqual(unknown.body);
    expect(mailbox().outbox).toHaveLength(0);
  });

  it('rate limits resend per address and per IP with the same error', async () => {
    await request(server()).post('/auth/signup').send({
      username: 'limited-wanderer',
      email: 'limited@example.test',
      password: 'limited-passphrase',
    });
    mailbox().clear();
    app.get(AuthRateLimiter).clear();

    const responses: Response[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(
        await request(server())
          .post('/auth/email/resend')
          .send({ email: 'limited@example.test' }),
      );
    }
    expect(responses.slice(0, 3).map((res) => res.status)).toEqual([
      200, 200, 200,
    ]);
    expect(responses[3].status).toBe(429);
    expect(responses[3].body.message).toBe(
      'Too many requests. Wait a little, then try again.',
    );
    expect(responses[3].headers['retry-after']).toBeDefined();
    expect(JSON.stringify(responses[3].body)).not.toContain(
      'limited@example.test',
    );
    expect(mailbox().outbox).toHaveLength(3);

    app.get(AuthRateLimiter).clear();
    const ipResponses: Response[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ipResponses.push(
        await request(server())
          .post('/auth/email/resend')
          .send({ email: `ip-${attempt}@example.test` }),
      );
    }
    expect(ipResponses.slice(0, 4).every((res) => res.status === 200)).toBe(
      true,
    );
    expect(ipResponses[4].status).toBe(429);
    expect(ipResponses[4].body).toEqual(responses[3].body);
    expect(JSON.stringify(ipResponses[4].body)).not.toContain(
      'ip-4@example.test',
    );
  });

  it('resets a password once, retires the other links, and drops older sessions', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'reset-wanderer',
      email: 'reset@example.test',
      password: 'old-passphrase',
    });
    const original = signup.body.access_token as string;
    const profile = await request(server()).get('/users').set(auth(original));
    expect(profile.status).toBe(200);
    const userId = profile.body[0].id as number;

    mailbox().clear();
    app.get(AuthRateLimiter).clear();
    const first = await request(server())
      .post('/auth/password/forgot')
      .send({ email: 'reset@example.test' });
    const missing = await request(server())
      .post('/auth/password/forgot')
      .send({ email: 'nobody-reset@example.test' });
    expect(first.status).toBe(200);
    expect(missing.body).toEqual(first.body);
    expect(JSON.stringify(missing.body)).not.toContain('reset@example.test');
    const missingTokens = await admin.query(
      `SELECT COUNT(*)::int AS count FROM "auth_tokens" t
       LEFT JOIN "users" u ON u."id" = t."userId"
       WHERE u."email" IS NULL`,
    );
    expect(Number(missingTokens[0].count)).toBe(0);

    const second = await request(server())
      .post('/auth/password/forgot')
      .send({ email: 'Reset@example.test' });
    expect(second.body).toEqual(first.body);
    expect(mailbox().outbox).toHaveLength(2);
    const firstToken = tokenFrom(mailbox().outbox[0]);
    const secondToken = tokenFrom(mailbox().outbox[1]);
    const stored = await admin.query(
      `SELECT "tokenHash" FROM "auth_tokens"
       WHERE "userId" = $1 AND "purpose" = 'password_reset'`,
      [userId],
    );
    expect(stored.map((row) => row.tokenHash).sort()).toEqual(
      [hashToken(firstToken), hashToken(secondToken)].sort(),
    );

    const updated = await request(server())
      .post('/auth/password/reset')
      .send({ token: firstToken, password: 'new-passphrase' });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ passwordUpdated: true });
    expect(JSON.stringify(updated.body)).not.toContain('new-passphrase');
    expect(JSON.stringify(updated.body)).not.toContain(firstToken);

    const reused = await request(server())
      .post('/auth/password/reset')
      .send({ token: firstToken, password: 'newer-passphrase' });
    const other = await request(server())
      .post('/auth/password/reset')
      .send({ token: secondToken, password: 'newer-passphrase' });
    expect(reused.status).toBe(400);
    expect(other.status).toBe(400);
    expect(other.body).toEqual(reused.body);

    const oldLogin = await request(server()).post('/auth/login').send({
      identifier: 'reset@example.test',
      password: 'old-passphrase',
    });
    expect(oldLogin.status).toBe(401);
    const stale = await request(server()).get('/users').set(auth(original));
    expect(stale.status).toBe(401);

    const fresh = await request(server()).post('/auth/login').send({
      identifier: 'reset@example.test',
      password: 'new-passphrase',
    });
    expect(fresh.status).toBe(201);
    const after = await request(server())
      .get('/users')
      .set(auth(fresh.body.access_token as string));
    expect(after.status).toBe(200);
    expect(after.body[0].id).toBe(userId);
    const version = await admin.query(
      `SELECT "sessionVersion" FROM "users" WHERE "id" = $1`,
      [userId],
    );
    expect(Number(version[0].sessionVersion)).toBe(1);
    const hash = await admin.query(
      `SELECT "password" FROM "users" WHERE "id" = $1`,
      [userId],
    );
    expect(hash[0].password).not.toBe('new-passphrase');
    expect(await bcrypt.compare('new-passphrase', hash[0].password)).toBe(true);
    expect(JSON.stringify(after.body)).not.toContain(hash[0].password);
  });

  it('does not change the password when the reset link has expired', async () => {
    await request(server()).post('/auth/signup').send({
      username: 'expired-reset',
      email: 'expired-reset@example.test',
      password: 'still-passphrase',
    });
    mailbox().clear();
    app.get(AuthRateLimiter).clear();
    await request(server())
      .post('/auth/password/forgot')
      .send({ email: 'expired-reset@example.test' });
    const linkToken = tokenFrom(onlyEmail());
    await admin.query(
      `UPDATE "auth_tokens" SET "expiresAt" = NOW() - interval '1 minute'
       WHERE "tokenHash" = $1`,
      [hashToken(linkToken)],
    );
    const attempt = await request(server())
      .post('/auth/password/reset')
      .send({ token: linkToken, password: 'changed-passphrase' });
    expect(attempt.status).toBe(400);
    expect(attempt.body.message).toBe(INVALID_LINK);
    const login = await request(server()).post('/auth/login').send({
      identifier: 'expired-reset@example.test',
      password: 'still-passphrase',
    });
    expect(login.status).toBe(201);
    const wrong = await request(server()).post('/auth/login').send({
      identifier: 'expired-reset@example.test',
      password: 'changed-passphrase',
    });
    expect(wrong.status).toBe(401);
  });

  it('rejects a new username or email that collides across the two columns', async () => {
    await request(server()).post('/auth/signup').send({
      username: 'plain-name',
      email: 'plain@example.test',
      password: 'plain-passphrase',
    });
    const usernameIsEmail = await request(server()).post('/auth/signup').send({
      username: 'plain@example.test',
      email: 'other-plain@example.test',
      password: 'plain-passphrase',
    });
    expect(usernameIsEmail.status).toBe(409);
    expect(usernameIsEmail.body.message).toBe('Username already taken!');

    await request(server()).post('/auth/signup').send({
      username: 'shadow@example.test',
      email: 'shadow-real@example.test',
      password: 'shadow-passphrase',
    });
    const emailIsUsername = await request(server()).post('/auth/signup').send({
      username: 'brand-new-name',
      email: 'shadow@example.test',
      password: 'shadow-passphrase',
    });
    expect(emailIsUsername.status).toBe(409);
    expect(emailIsUsername.body.message).toBe('Email already in use!');
  });

  it('uses the password to choose between a legacy username and email collision', async () => {
    const shared = await bcrypt.hash('shared-passphrase', 10);
    const emailHash = await bcrypt.hash('email-passphrase', 10);
    const nameHash = await bcrypt.hash('name-passphrase', 10);
    await admin.query(
      `INSERT INTO "users" ("username", "email", "password", "emailVerified", "sessionVersion")
       VALUES ($1, $2, $3, true, 0), ($4, $5, $6, true, 0)`,
      [
        'victim-name',
        'victim@example.test',
        emailHash,
        'victim@example.test',
        'imposter@example.test',
        nameHash,
      ],
    );
    const asEmail = await request(server()).post('/auth/login').send({
      identifier: 'victim@example.test',
      password: 'email-passphrase',
    });
    const asName = await request(server()).post('/auth/login').send({
      identifier: 'victim@example.test',
      password: 'name-passphrase',
    });
    expect(asEmail.status).toBe(201);
    expect(asName.status).toBe(201);
    const emailProfile = await request(server())
      .get('/users')
      .set(auth(asEmail.body.access_token as string));
    const nameProfile = await request(server())
      .get('/users')
      .set(auth(asName.body.access_token as string));
    expect(emailProfile.body[0].email).toBe('victim@example.test');
    expect(nameProfile.body[0].email).toBe('imposter@example.test');

    await admin.query(
      `UPDATE "users" SET "password" = $1 WHERE "email" IN ($2, $3)`,
      [shared, 'victim@example.test', 'imposter@example.test'],
    );
    const both = await request(server()).post('/auth/login').send({
      identifier: 'victim@example.test',
      password: 'shared-passphrase',
    });
    const neither = await request(server()).post('/auth/login').send({
      identifier: 'victim@example.test',
      password: 'email-passphrase',
    });
    expect(both.status).toBe(401);
    expect(neither.status).toBe(401);
    expect(both.body).toEqual(neither.body);
  });

  it('clears verification when the address changes and retires the old link', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'moving-wanderer',
      email: 'moving@example.test',
      password: 'moving-passphrase',
    });
    const firstToken = tokenFrom(onlyEmail());
    mailbox().clear();
    app.get(AuthRateLimiter).clear();
    await request(server())
      .post('/auth/email/resend')
      .send({ email: 'moving@example.test' });
    const unusedToken = tokenFrom(onlyEmail());
    const confirmed = await request(server())
      .post('/auth/email/verify')
      .send({ token: firstToken });
    expect(confirmed.status).toBe(200);

    const profile = await request(server())
      .get('/users')
      .set(auth(signup.body.access_token as string));
    const moved = await request(server())
      .put(`/users/${profile.body[0].id}`)
      .set(auth(signup.body.access_token as string))
      .send({ email: 'moved@example.test' });
    expect(moved.status).toBe(200);
    expect(moved.body.email).toBe('moved@example.test');
    expect(moved.body.emailVerified).toBe(false);
    expect(moved.body.password).toBeUndefined();

    const staleLink = await request(server())
      .post('/auth/email/verify')
      .send({ token: unusedToken });
    expect(staleLink.status).toBe(400);
    const still = await request(server())
      .get('/users')
      .set(auth(signup.body.access_token as string));
    expect(still.body[0].emailVerified).toBe(false);

    const kept = await admin.query(
      `SELECT "content" FROM "notes" WHERE "content" = $1`,
      [KEPT_NOTE],
    );
    expect(kept).toHaveLength(1);
  });
});

function migrationName(migration: MigrationInterface): string {
  return migration.name || migration.constructor.name;
}

function server(): ReturnType<INestApplication['getHttpServer']> {
  return app().getHttpServer();
}

let nestApp: INestApplication;

function app(): INestApplication {
  if (!nestApp) throw new Error('app is not ready');
  return nestApp;
}

function remember(application: INestApplication): void {
  nestApp = application;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function mailbox(): ConsoleEmailProvider {
  const provider = app().get<EmailProvider>(EMAIL_PROVIDER);
  if (!(provider instanceof ConsoleEmailProvider)) {
    throw new Error('expected the console email provider');
  }
  return provider;
}

function onlyEmail(): OutboundEmail {
  const sent = mailbox().outbox;
  if (sent.length !== 1) {
    throw new Error(`expected one email, found ${sent.length}`);
  }
  return sent[0];
}

function tokenFrom(message: OutboundEmail): string {
  const match = message.text.match(/token=([^&\s]+)/);
  if (!match) throw new Error('email did not include a token');
  return decodeURIComponent(match[1]);
}

function startPostgres(): void {
  spawnSync('rm', ['-rf', DATA_DIR]);
  const init = spawnSync(
    `${PG}/initdb`,
    ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust', '--no-instructions'],
    { encoding: 'utf8' },
  );
  if (init.status !== 0) {
    throw new Error(init.stderr || init.stdout || 'initdb failed');
  }
  const started = spawnSync(`${PG}/pg_ctl`, [
    '-D',
    DATA_DIR,
    '-l',
    LOG,
    '-w',
    '-o',
    `-p ${PORT} -k ${DATA_DIR} -c listen_addresses=127.0.0.1`,
    'start',
  ]);
  if (started.status !== 0) {
    const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
    throw new Error(`pg_ctl start failed\n${log}`);
  }
  const created = spawnSync(`${PG}/createdb`, [
    '-h',
    '127.0.0.1',
    '-p',
    String(PORT),
    '-U',
    'postgres',
    DATABASE,
  ]);
  if (created.status !== 0) {
    throw new Error('createdb failed');
  }
}

async function loadMigrations(): Promise<MigrationInterface[]> {
  const dir = join(process.cwd(), 'src/migrations');
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const migrations: MigrationInterface[] = [];
  for (const file of files) {
    const imported = (await import(join(dir, file))) as Record<string, unknown>;
    const exported = Object.values(imported).find(
      (value) =>
        typeof value === 'function' &&
        value.prototype &&
        typeof value.prototype.up === 'function',
    ) as (new () => MigrationInterface) | undefined;
    if (!exported) throw new Error(`No migration class in ${file}`);
    migrations.push(new exported());
  }
  return migrations;
}

async function apply(
  dataSource: DataSource,
  migration: MigrationInterface,
  direction: 'up' | 'down',
): Promise<void> {
  const runner: QueryRunner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    if (direction === 'up') await migration.up(runner);
    else await migration.down(runner);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

function ensureBuilt(): void {
  const source = join(
    process.cwd(),
    'src/migrations/1790500000000-AddAccountLifecycle.ts',
  );
  const compiled = join(
    process.cwd(),
    'dist/migrations/1790500000000-AddAccountLifecycle.js',
  );
  const dataSource = join(process.cwd(), 'dist/data-source.js');
  const stale =
    !existsSync(compiled) ||
    !existsSync(dataSource) ||
    statSync(source).mtimeMs > statSync(compiled).mtimeMs;
  if (!stale) return;
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    throw new Error(`build failed\n${build.stdout}\n${build.stderr}`);
  }
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

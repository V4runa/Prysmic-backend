/* Supertest bodies and the dynamic migration loader are loose by design. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { AppModule } from '../../app.module';
import { AccountLifecycleService } from './account-lifecycle.service';
import {
  REFRESH_EXPIRED,
  REFRESH_EXPIRED_CODE,
  REFRESH_REVOKED,
  REFRESH_REVOKED_CODE,
} from './account.constants';
import { ConsoleEmailProvider } from './email/console-email.provider';
import { EMAIL_PROVIDER } from './email/email.provider.factory';
import type { OutboundEmail } from './email/email.types';
import { REFRESH_COOKIE } from './sessions/refresh-cookie';
import { hashToken } from './tokens/token-hash';
import { pgBinDir } from '../../testing/pg-bin';

const PORT = 54360;
const DATA_DIR = '/tmp/prysmic-refresh-pg';
const LOG = '/tmp/prysmic-refresh-pg.log';
const DATABASE = 'prysmic_refresh';
const DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/${DATABASE}`;
const PASSWORD = 'refresh-passphrase';

jest.setTimeout(180000);

describe('refresh sessions against disposable Postgres', () => {
  let admin: DataSource;
  let app: INestApplication;
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_SSL: process.env.DB_SSL,
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    APP_URL: process.env.APP_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    DB_LOGGING: process.env.DB_LOGGING,
  };

  beforeAll(async () => {
    if (new URL(DATABASE_URL).hostname !== '127.0.0.1') {
      throw new Error('Refusing a non-local database host');
    }
    startPostgres();
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DB_SSL = 'false';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'refresh-session-test-secret';
    process.env.APP_URL = 'http://localhost:3000';
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
    for (const migration of migrations) {
      await apply(admin, migration, 'up');
    }
    const refresh = migrations.find((migration) =>
      migrationName(migration).includes('AddRefreshSessions'),
    );
    if (!refresh) throw new Error('refresh migration was not loaded');
    await apply(admin, refresh, 'down');
    const dropped = await admin.query(
      `SELECT to_regclass('public.refresh_tokens') AS name`,
    );
    expect(dropped[0].name).toBeNull();
    await apply(admin, refresh, 'up');
    const rule = await admin.query(
      `SELECT rc.delete_rule
       FROM information_schema.referential_constraints rc
       WHERE rc.constraint_name = 'FK_refresh_tokens_user'`,
    );
    expect(rule[0].delete_rule).toBe('CASCADE');

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
  });

  afterAll(async () => {
    await app?.close();
    if (admin?.isInitialized) await admin.destroy();
    spawnSync(`${pgBinDir()}/pg_ctl`, ['-D', DATA_DIR, '-w', 'stop']);
    spawnSync('rm', ['-rf', DATA_DIR]);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('issues an httpOnly refresh cookie and keeps the access token working alone', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'stay-signed',
      email: 'stay@example.test',
      password: PASSWORD,
    });
    expect(signup.status).toBe(201);
    expect(Object.keys(signup.body).sort()).toEqual([
      'access_token',
      'emailVerified',
    ]);
    const cookie = refreshCookie(signup);
    expect(cookie.line).toContain('HttpOnly');
    expect(cookie.line).toContain('Path=/auth');
    expect(cookie.line.toLowerCase()).toContain('samesite=lax');
    expect(cookie.line).not.toContain('Secure');
    expect(JSON.stringify(signup.body)).not.toContain(cookie.raw);

    const stored = await admin.query(
      `SELECT "tokenHash" FROM "refresh_tokens" WHERE "userId" = $1`,
      [payloadOf(signup.body.access_token).sub],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(hashToken(cookie.raw));
    expect(stored[0].tokenHash).not.toContain(cookie.raw);

    const profile = await request(server())
      .get('/users')
      .set(auth(signup.body.access_token));
    expect(profile.status).toBe(200);

    const claims = payloadOf(signup.body.access_token);
    const expired = new JwtService({
      secret: process.env.JWT_SECRET,
    }).sign(
      {
        sub: claims.sub,
        username: claims.username,
        email: claims.email,
        sv: claims.sv,
      },
      { expiresIn: '-1s' },
    );
    const rejected = await request(server()).get('/users').set(auth(expired));
    expect(rejected.status).toBe(401);

    const renewed = await request(server())
      .post('/auth/refresh')
      .set('Cookie', cookie.header);
    expect(renewed.status).toBe(200);
    expect(renewed.body.access_token).toEqual(expect.any(String));
    const rotated = refreshCookie(renewed);
    expect(rotated.raw).not.toBe(cookie.raw);
    const profileAgain = await request(server())
      .get('/users')
      .set(auth(renewed.body.access_token));
    expect(profileAgain.status).toBe(200);
  });

  it('rotates the refresh token and rejects a reused one by revoking the family', async () => {
    const first = await signIn('rotate-user', 'rotate@example.test');
    const rotated = await request(server())
      .post('/auth/refresh')
      .set('Cookie', first.cookie.header);
    expect(rotated.status).toBe(200);
    const next = refreshCookie(rotated);
    expect(next.raw).not.toBe(first.cookie.raw);
    expect(JSON.stringify(rotated.body)).not.toContain(next.raw);

    const rows = await familyRows(first.userId);
    expect(rows).toHaveLength(2);
    const predecessor = rows.find(
      (row) => row.tokenHash === hashToken(first.cookie.raw),
    );
    const successor = rows.find((row) => row.tokenHash === hashToken(next.raw));
    expect(predecessor?.rotatedAt).toBeTruthy();
    expect(predecessor?.revokedAt).toBeNull();
    expect(successor?.rotatedAt).toBeNull();
    expect(successor?.familyId).toBe(predecessor?.familyId);

    const again = await request(server())
      .post('/auth/refresh')
      .set('Cookie', next.header);
    expect(again.status).toBe(200);

    const reused = await request(server())
      .post('/auth/refresh')
      .set('Cookie', first.cookie.header);
    expect(reused.status).toBe(401);
    expect(reused.body).toMatchObject({
      statusCode: 401,
      code: REFRESH_REVOKED_CODE,
      message: REFRESH_REVOKED,
    });

    const after = await familyRows(first.userId);
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(after.every((row) => row.revokedAt)).toBe(true);

    const killed = await request(server())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(again).header);
    expect(killed.status).toBe(401);
    expect(killed.body.code).toBe(REFRESH_REVOKED_CODE);
  });

  it('rejects an expired refresh token without revoking a different session', async () => {
    const current = await signIn('expire-user', 'expire@example.test');
    const other = await signIn('expire-other', 'expire-other@example.test');
    await admin.query(
      `UPDATE "refresh_tokens"
       SET "expiresAt" = NOW() - INTERVAL '1 minute'
       WHERE "tokenHash" = $1`,
      [hashToken(current.cookie.raw)],
    );

    const expired = await request(server())
      .post('/auth/refresh')
      .set('Cookie', current.cookie.header);
    expect(expired.status).toBe(401);
    expect(expired.body).toMatchObject({
      statusCode: 401,
      code: REFRESH_EXPIRED_CODE,
      message: REFRESH_EXPIRED,
    });
    const rows = await familyRows(current.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].revokedAt).toBeNull();
    expect(rows[0].rotatedAt).toBeNull();

    const still = await request(server())
      .post('/auth/refresh')
      .set('Cookie', other.cookie.header);
    expect(still.status).toBe(200);

    const missing = await request(server()).post('/auth/refresh');
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe(REFRESH_REVOKED_CODE);
  });

  it('revokes only the logged-out session', async () => {
    const first = await signIn('logout-user', 'logout@example.test');
    const second = await request(server()).post('/auth/login').send({
      identifier: 'logout@example.test',
      password: PASSWORD,
    });
    expect(second.status).toBe(201);
    const other = refreshCookie(second);

    const gone = await request(server())
      .post('/auth/logout')
      .set('Cookie', first.cookie.header);
    expect(gone.status).toBe(200);
    expect(gone.body).toEqual({ loggedOut: true });
    expect(cleared(gone)).toBe(true);

    const rejected = await request(server())
      .post('/auth/refresh')
      .set('Cookie', first.cookie.header);
    expect(rejected.status).toBe(401);
    expect(rejected.body.code).toBe(REFRESH_REVOKED_CODE);

    const kept = await request(server())
      .post('/auth/refresh')
      .set('Cookie', other.header);
    expect(kept.status).toBe(200);

    const bare = await request(server()).post('/auth/logout');
    expect(bare.status).toBe(200);
    expect(bare.body).toEqual({ loggedOut: true });
  });

  it('revokes every session when the password changes', async () => {
    const first = await signIn('change-user', 'change@example.test');
    const second = await request(server()).post('/auth/login').send({
      identifier: 'change@example.test',
      password: PASSWORD,
    });
    const other = refreshCookie(second);

    const changed = await request(server())
      .post('/auth/password/change')
      .set(auth(first.accessToken))
      .send({
        currentPassword: PASSWORD,
        newPassword: 'changed-passphrase',
      });
    expect(changed.status).toBe(200);
    expect(Object.keys(changed.body).sort()).toEqual([
      'access_token',
      'emailVerified',
    ]);
    const replacement = refreshCookie(changed);

    expect(
      (await request(server()).get('/users').set(auth(first.accessToken)))
        .status,
    ).toBe(401);
    expect(
      (
        await request(server())
          .post('/auth/refresh')
          .set('Cookie', first.cookie.header)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(server())
          .post('/auth/refresh')
          .set('Cookie', other.header)
      ).status,
    ).toBe(401);

    const kept = await request(server())
      .post('/auth/refresh')
      .set('Cookie', replacement.header);
    expect(kept.status).toBe(200);
    const profile = await request(server())
      .get('/users')
      .set(auth(changed.body.access_token));
    expect(profile.status).toBe(200);
  });

  it('revokes every session when the account is deleted', async () => {
    const first = await signIn('delete-user', 'delete@example.test');
    const second = await request(server()).post('/auth/login').send({
      identifier: 'delete@example.test',
      password: PASSWORD,
    });
    const other = refreshCookie(second);

    const removed = await request(server())
      .delete('/users/me')
      .set(auth(first.accessToken))
      .send({ password: PASSWORD });
    expect(removed.status).toBe(204);
    expect(cleared(removed)).toBe(true);

    expect(
      (
        await request(server())
          .post('/auth/refresh')
          .set('Cookie', first.cookie.header)
      ).body.code,
    ).toBe(REFRESH_REVOKED_CODE);
    expect(
      (
        await request(server())
          .post('/auth/refresh')
          .set('Cookie', other.header)
      ).body.code,
    ).toBe(REFRESH_REVOKED_CODE);
    const left = await admin.query(
      `SELECT COUNT(*)::int AS n FROM "refresh_tokens" WHERE "userId" = $1`,
      [first.userId],
    );
    expect(left[0].n).toBe(0);
  });

  it('revokes every session when the password is reset', async () => {
    const first = await signIn('reset-user', 'reset@example.test');
    const second = await request(server()).post('/auth/login').send({
      identifier: 'reset@example.test',
      password: PASSWORD,
    });
    const other = refreshCookie(second);
    const mailbox = app.get<ConsoleEmailProvider>(EMAIL_PROVIDER);
    mailbox.clear();

    const forgot = await request(server())
      .post('/auth/password/forgot')
      .send({ email: 'reset@example.test' });
    expect(forgot.status).toBe(200);
    await app.get(AccountLifecycleService).settleMail();
    const letter = mailbox.outbox.find((message) =>
      message.subject.toLowerCase().includes('password'),
    );
    if (!letter) throw new Error('reset email was not captured');
    const token = tokenFrom(letter);

    const reset = await request(server())
      .post('/auth/password/reset')
      .set('Cookie', first.cookie.header)
      .send({ token, password: 'reset-passphrase' });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ passwordUpdated: true });
    expect(cleared(reset)).toBe(true);

    expect(
      (
        await request(server())
          .post('/auth/refresh')
          .set('Cookie', first.cookie.header)
      ).body.code,
    ).toBe(REFRESH_REVOKED_CODE);
    expect(
      (
        await request(server())
          .post('/auth/refresh')
          .set('Cookie', other.header)
      ).body.code,
    ).toBe(REFRESH_REVOKED_CODE);
    expect(
      (await request(server()).get('/users').set(auth(first.accessToken)))
        .status,
    ).toBe(401);
  });

  function server() {
    return app.getHttpServer();
  }

  async function signIn(username: string, email: string) {
    const created = await request(server()).post('/auth/signup').send({
      username,
      email,
      password: PASSWORD,
    });
    expect(created.status).toBe(201);
    const cookie = refreshCookie(created);
    return {
      accessToken: created.body.access_token as string,
      cookie,
      userId: payloadOf(created.body.access_token).sub,
    };
  }
});

type FamilyRow = {
  familyId: string;
  tokenHash: string;
  rotatedAt: Date | null;
  revokedAt: Date | null;
};

async function familyRows(userId: number): Promise<FamilyRow[]> {
  const dataSource = appData();
  return dataSource.query(
    `SELECT "familyId", "tokenHash", "rotatedAt", "revokedAt"
     FROM "refresh_tokens" WHERE "userId" = $1 ORDER BY "id"`,
    [userId],
  );
}

let boundAdmin: DataSource | undefined;

function appData(): DataSource {
  if (!boundAdmin) throw new Error('database is not ready');
  return boundAdmin;
}

function payloadOf(token: string): {
  sub: number;
  sv: number;
  username: string;
  email: string;
} {
  const segment = token.split('.')[1];
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function refreshCookie(res: Response): {
  line: string;
  raw: string;
  header: string;
} {
  const line = setCookieLines(res).find((item) =>
    item.startsWith(`${REFRESH_COOKIE}=`),
  );
  if (!line) throw new Error('missing refresh cookie');
  const pair = line.split(';')[0];
  const raw = decodeURIComponent(pair.slice(REFRESH_COOKIE.length + 1));
  return { line, raw, header: pair };
}

function cleared(res: Response): boolean {
  const line = setCookieLines(res).find((item) =>
    item.startsWith(`${REFRESH_COOKIE}=`),
  );
  if (!line) return false;
  return /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(line);
}

function setCookieLines(res: Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function tokenFrom(message: OutboundEmail): string {
  const match = message.text.match(/token=([^&\s]+)/);
  if (!match) throw new Error('email did not include a token');
  return decodeURIComponent(match[1]);
}

function startPostgres(): void {
  spawnSync('rm', ['-rf', DATA_DIR]);
  const init = spawnSync(
    `${pgBinDir()}/initdb`,
    ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust', '--no-instructions'],
    { encoding: 'utf8' },
  );
  if (init.status !== 0) {
    throw new Error(init.stderr || init.stdout || 'initdb failed');
  }
  const started = spawnSync(`${pgBinDir()}/pg_ctl`, [
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
  const created = spawnSync(`${pgBinDir()}/createdb`, [
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

function migrationName(migration: MigrationInterface): string {
  return migration.name || migration.constructor.name;
}

async function apply(
  dataSource: DataSource,
  migration: MigrationInterface,
  direction: 'up' | 'down',
): Promise<void> {
  boundAdmin = dataSource;
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

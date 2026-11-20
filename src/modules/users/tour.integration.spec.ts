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
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { AppModule } from '../../app.module';
import { DEFAULT_MOOD_OPTIONS } from '../moods/mood-option.entity';
import { pgBinDir } from '../../testing/pg-bin';

const PORT = 54362;
const DATA_DIR = '/tmp/prysmic-tour-pg';
const LOG = '/tmp/prysmic-tour-pg.log';
const DATABASE = 'prysmic_tour';
const DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/${DATABASE}`;

const KEPT_NOTE = 'kept sample note that must survive the tour migration';
const KEPT_PASSWORD = 'kept-hash-not-a-login';
const SIGNUP_PASSWORD = 'tour-passphrase';

jest.setTimeout(180000);

describe('first-run tour against disposable Postgres', () => {
  let admin: DataSource;
  let app: INestApplication;
  let legacyId = 0;
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
    process.env.JWT_SECRET = 'tour-integration-secret';
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
    const tour = migrations.find((migration) =>
      migrationName(migration).includes('AddTourSeenAt'),
    );
    if (!tour) throw new Error('tourSeenAt migration was not loaded');
    for (const migration of migrations) {
      if (migration === tour) continue;
      await apply(admin, migration, 'up');
    }

    const inserted = await admin.query(
      `INSERT INTO "users" ("username", "email", "password")
       VALUES ($1, $2, $3) RETURNING "id"`,
      ['existing-keeper', 'existing@example.test', KEPT_PASSWORD],
    );
    legacyId = Number(inserted[0].id);
    await admin.query(
      `INSERT INTO "notes" ("title", "content", "userId")
       VALUES ($1, $2, $3)`,
      ['Kept sample', KEPT_NOTE, legacyId],
    );

    await apply(admin, tour, 'up');
    const backfilled = await admin.query(
      `SELECT "tourSeenAt", "password" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(backfilled[0].tourSeenAt).toBeTruthy();
    expect(backfilled[0].password).toBe(KEPT_PASSWORD);
    expect(await noteContents(legacyId)).toEqual([KEPT_NOTE]);

    const rawNew = await admin.query(
      `INSERT INTO "users" ("username", "email", "password")
       VALUES ($1, $2, $3) RETURNING "tourSeenAt"`,
      ['raw-new', 'raw-new@example.test', 'raw-hash'],
    );
    expect(rawNew[0].tourSeenAt).toBeNull();

    await apply(admin, tour, 'down');
    const dropped = await admin.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'tourSeenAt'`,
    );
    expect(dropped).toHaveLength(0);
    const stillThere = await admin.query(
      `SELECT "password" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(stillThere[0].password).toBe(KEPT_PASSWORD);
    expect(await noteContents(legacyId)).toEqual([KEPT_NOTE]);

    await apply(admin, tour, 'up');
    const restored = await admin.query(
      `SELECT "tourSeenAt", "password" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(restored[0].tourSeenAt).toBeTruthy();
    expect(restored[0].password).toBe(KEPT_PASSWORD);

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
    await app.init();
    remember(app);
  }, 180000);

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

  it('registers without sample content, with default moods, and sets tourSeenAt', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'new-wanderer',
      email: 'wanderer@example.test',
      password: SIGNUP_PASSWORD,
    });
    expect(signup.status).toBe(201);
    const token = signup.body.access_token as string;

    const profile = await request(server()).get('/users').set(auth(token));
    expect(profile.status).toBe(200);
    expect(profile.body).toHaveLength(1);
    const userId = profile.body[0].id as number;
    expect(profile.body[0].tourSeenAt).toBeNull();
    expect(profile.body[0].email).toBe('wanderer@example.test');
    expect(JSON.stringify(profile.body)).not.toContain(SIGNUP_PASSWORD);

    expect(await count('notes', userId)).toBe(0);
    expect(await count('task', userId)).toBe(0);
    expect(await count('habit', userId)).toBe(0);
    expect(await count('tags', userId)).toBe(0);
    expect(await linkCount('note_tags', 'notes', 'notesId', userId)).toBe(0);
    expect(await linkCount('task_tags', 'task', 'taskId', userId)).toBe(0);

    const moods = await admin.query(
      `SELECT "label", "emoji", "color", "sortOrder"
       FROM "mood_options" WHERE "userId" = $1 ORDER BY "sortOrder", "id"`,
      [userId],
    );
    expect(
      moods.map((mood) => ({
        label: mood.label,
        emoji: mood.emoji,
        color: mood.color,
        sortOrder: Number(mood.sortOrder),
      })),
    ).toEqual(
      DEFAULT_MOOD_OPTIONS.map((mood, sortOrder) => ({ ...mood, sortOrder })),
    );

    const other = await request(server()).post('/auth/signup').send({
      username: 'other-wanderer',
      email: 'other-wanderer@example.test',
      password: SIGNUP_PASSWORD,
    });
    expect(other.status).toBe(201);
    const otherToken = other.body.access_token as string;
    const otherProfile = await request(server())
      .get('/users')
      .set(auth(otherToken));
    expect(otherProfile.body[0].tourSeenAt).toBeNull();

    const anonymous = await request(server()).patch('/users/me/tour').send({});
    expect(anonymous.status).toBe(401);

    const rejected = await request(server())
      .patch('/users/me/tour')
      .set(auth(token))
      .send({ seen: 'yes' });
    expect(rejected.status).toBe(400);

    const seen = await request(server())
      .patch('/users/me/tour')
      .set(auth(token))
      .send({});
    expect(seen.status).toBe(200);
    expect(typeof seen.body.tourSeenAt).toBe('string');
    expect(Number.isNaN(Date.parse(seen.body.tourSeenAt))).toBe(false);

    const marked = await request(server()).get('/users').set(auth(token));
    expect(marked.body[0].tourSeenAt).toBe(seen.body.tourSeenAt);

    const again = await request(server())
      .patch('/users/me/tour')
      .set(auth(token))
      .send({ seen: true });
    expect(again.status).toBe(200);
    expect(typeof again.body.tourSeenAt).toBe('string');

    const untouched = await request(server())
      .get('/users')
      .set(auth(otherToken));
    expect(untouched.body[0].tourSeenAt).toBeNull();

    const cleared = await request(server())
      .patch('/users/me/tour')
      .set(auth(token))
      .send({ seen: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ tourSeenAt: null });

    const reset = await request(server()).get('/users').set(auth(token));
    expect(reset.body[0].tourSeenAt).toBeNull();

    const stored = await admin.query(
      `SELECT "tourSeenAt" FROM "users" WHERE "id" = $1`,
      [userId],
    );
    expect(stored[0].tourSeenAt).toBeNull();

    const legacy = await admin.query(
      `SELECT "password", "tourSeenAt" FROM "users" WHERE "id" = $1`,
      [legacyId],
    );
    expect(legacy[0].password).toBe(KEPT_PASSWORD);
    expect(legacy[0].tourSeenAt).toBeTruthy();
    expect(await noteContents(legacyId)).toEqual([KEPT_NOTE]);
    expect(await count('notes', legacyId)).toBe(1);
  });

  async function noteContents(userId: number): Promise<string[]> {
    const rows = await admin.query(
      `SELECT "content" FROM "notes" WHERE "userId" = $1 ORDER BY "id"`,
      [userId],
    );
    return rows.map((row) => row.content as string);
  }

  async function count(table: string, userId: number): Promise<number> {
    const rows = await admin.query(
      `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "userId" = $1`,
      [userId],
    );
    return Number(rows[0].count);
  }

  async function linkCount(
    linkTable: string,
    ownerTable: string,
    ownerColumn: string,
    userId: number,
  ): Promise<number> {
    const rows = await admin.query(
      `SELECT COUNT(*)::int AS count
       FROM "${linkTable}" link
       INNER JOIN "${ownerTable}" owner ON owner.id = link."${ownerColumn}"
       WHERE owner."userId" = $1`,
      [userId],
    );
    return Number(rows[0].count);
  }
});

function server() {
  return appRef().getHttpServer();
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

let boundApp: INestApplication | undefined;

function appRef(): INestApplication {
  if (!boundApp) throw new Error('app is not ready');
  return boundApp;
}

function remember(app: INestApplication): void {
  boundApp = app;
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

/* Supertest bodies and raw pg rows are loose by design. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { AppModule } from '../../app.module';
import {
  INVALID_CREDENTIALS,
  INVALID_LINK,
  RATE_LIMIT_MESSAGE,
} from '../auth/account.constants';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';
import { ConsoleEmailProvider } from '../auth/email/console-email.provider';
import { EMAIL_PROVIDER } from '../auth/email/email.provider.factory';
import type { EmailProvider, OutboundEmail } from '../auth/email/email.types';
import { AuthRateLimiter } from '../auth/rate-limit';
import { CascadeOwnedUserData1790600000000 } from '../../migrations/1790600000000-CascadeOwnedUserData';
import { pgBinDir } from '../../testing/pg-bin';

const PORT = 54352;
const DATA_DIR = '/tmp/prysmic-account-deletion-pg';
const LOG = '/tmp/prysmic-account-deletion-pg.log';
const DATABASE = 'prysmic_deletion';
const DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/${DATABASE}`;

const ORIGIN_FK = 'FK_52202c28f0e9699f9ce660fb815';
const TAG_LINK_FK = 'FK_993c9e3195b19f2928a42cf113b';
const OWNED_TABLES = [
  'auth_tokens',
  'calendar_event',
  'habit',
  'mood',
  'mood_options',
  'note_attachments',
  'notes',
  'tags',
  'task',
];

const ALPHA_EMAIL = 'alpha-owner@example.test';
const BETA_EMAIL = 'beta-owner@example.test';
const ALPHA_PASSWORD = 'alpha-journal-passphrase';
const BETA_PASSWORD = 'beta-journal-passphrase';

jest.setTimeout(180000);

describe('account deletion and password policy against Postgres', () => {
  let app: INestApplication;
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
    if (new URL(DATABASE_URL).hostname !== '127.0.0.1') {
      throw new Error('Refusing a non-local database host');
    }
    startPostgres();
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DB_SSL = 'false';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'account-deletion-integration-secret';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.AUTH_RATE_LIMIT_ACCOUNT = '2';
    process.env.AUTH_RATE_LIMIT_IP = '30';
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

    // Filename order, not the timestamp baked into a few class names. One
    // older migration would otherwise run before the tables it alters exist.
    const migrations = await loadMigrations();
    const owned = migrations.find((migration) =>
      migrationName(migration).includes('CascadeOwnedUserData'),
    );
    if (!owned) throw new Error('account deletion migration was not loaded');
    for (const migration of migrations) {
      if (migration === owned) continue;
      await applyMigration(migration, 'up');
    }
    await admin.query(`
      CREATE TABLE IF NOT EXISTS "migrations" (
        "id" SERIAL NOT NULL,
        "timestamp" bigint NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
      )
    `);
    for (const migration of migrations) {
      if (migration === owned) continue;
      const name = migrationName(migration);
      await admin.query(
        `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
        [Number.parseInt(name.slice(-13), 10), name],
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

    const fixtureHash = await bcrypt.hash('fixture-only', 4);
    const fixture = await admin.query(
      `INSERT INTO "users" ("username", "email", "password")
       VALUES ('fixture-owner', 'fixture-owner@example.test', $1)
       RETURNING "id"`,
      [fixtureHash],
    );
    const fixtureId = Number(fixture[0].id);
    const seeded = await seedOwned(fixtureId, 'fixture-marker');
    expect(await deleteAction(ORIGIN_FK)).toBe('n');
    expect(await deleteAction(TAG_LINK_FK)).toBe('c');

    await apply('down');
    expect(await deleteAction(ORIGIN_FK)).toBe('a');
    expect(await deleteAction(TAG_LINK_FK)).toBe('a');
    const duringDown = await admin.query(
      `SELECT "content" FROM "notes" WHERE "id" = $1`,
      [seeded.noteId],
    );
    expect(duringDown[0].content).toBe('fixture-marker-body');

    await apply('up');
    expect(await deleteAction(ORIGIN_FK)).toBe('n');
    expect(await deleteAction(TAG_LINK_FK)).toBe('c');
    const restored = await admin.query(
      `SELECT "content" FROM "notes" WHERE "id" = $1`,
      [seeded.noteId],
    );
    expect(restored[0].content).toBe('fixture-marker-body');

    await admin.query(`DELETE FROM "users" WHERE "id" = $1`, [fixtureId]);
    expect(await ownedCounts(fixtureId)).toEqual(zeroOwned());
    expect(await orphanCounts()).toEqual({
      note_tags: 0,
      task_tags: 0,
      habit_check: 0,
      origin: 0,
      attachment_note: 0,
    });

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
    spawnSync(`${pgBinDir()}/pg_ctl`, ['-D', DATA_DIR, '-w', 'stop']);
    spawnSync('rm', ['-rf', DATA_DIR]);
    restoreEnv(previousEnv);
  });

  beforeEach(async () => {
    await clearMail();
    app.get(AuthRateLimiter).clear();
  });

  it('publishes the password bounds', async () => {
    const policy = await request(server()).get('/auth/password-policy');
    expect(policy.status).toBe(200);
    expect(policy.body).toEqual({ minLength: 8, maxBytes: 72 });
  });

  it('rejects new passwords and still accepts ones already stored', async () => {
    const email = 'policy-user@example.test';
    const username = 'policy-user';
    const cases: Array<[string, string]> = [
      ['short1', 'Password must be at least 8 characters.'],
      ['password', 'That password is too common. Choose a different one.'],
      [email, 'Password cannot be your email address.'],
      ['Policy-User', 'Password cannot be the part of your email before @.'],
      ['x'.repeat(73), 'Password must be at most 72 bytes.'],
    ];
    for (const [password, expected] of cases) {
      const rejected = await request(server()).post('/auth/signup').send({
        username,
        email,
        password,
      });
      expect(rejected.status).toBe(400);
      expect(errorMessage(rejected.body)).toBe(expected);
    }
    const usernameHit = await request(server()).post('/auth/signup').send({
      username: 'NotebookKeeper',
      email: 'mail-keeper@example.test',
      password: 'notebookkeeper',
    });
    expect(usernameHit.status).toBe(400);
    expect(errorMessage(usernameHit.body)).toBe(
      'Password cannot be your username.',
    );
    const created = await request(server()).post('/auth/signup').send({
      username,
      email,
      password: 'policy-ok-passphrase',
    });
    expect(created.status).toBe(201);
    expect(
      await admin.query(`SELECT "id" FROM "users" WHERE "email" = $1`, [email]),
    ).toHaveLength(1);

    const shortHash = await bcrypt.hash('abc123', 4);
    const commonHash = await bcrypt.hash('password', 4);
    await admin.query(
      `INSERT INTO "users" ("username", "email", "password", "emailVerified", "sessionVersion")
       VALUES ('legacy-short', 'legacy-short@example.test', $1, true, 0),
              ('legacy-common', 'legacy-common@example.test', $2, true, 0)`,
      [shortHash, commonHash],
    );
    const shortLogin = await request(server()).post('/auth/login').send({
      identifier: 'legacy-short@example.test',
      password: 'abc123',
    });
    const commonLogin = await request(server()).post('/auth/login').send({
      identifier: 'legacy-common',
      password: 'password',
    });
    expect(shortLogin.status).toBe(201);
    expect(commonLogin.status).toBe(201);

    const removed = await request(server())
      .delete('/users/me')
      .set(auth(shortLogin.body.access_token as string))
      .send({ password: 'abc123' });
    expect(removed.status).toBe(204);
    const verifiedLetter = (await delivered()).filter(
      (message) =>
        message.subject === 'Your Prysmic account has been deleted' &&
        message.to === 'legacy-short@example.test',
    );
    expect(verifiedLetter).toHaveLength(1);
    expect(verifiedLetter[0].text).not.toContain('abc123');
    const shortAgain = await request(server())
      .get('/users')
      .set(auth(shortLogin.body.access_token as string));
    expect(shortAgain.status).toBe(401);
    const commonStill = await request(server()).post('/auth/login').send({
      identifier: 'legacy-common@example.test',
      password: 'password',
    });
    expect(commonStill.status).toBe(201);
  });

  it('keeps a reset link usable when the new password is rejected', async () => {
    const email = 'reset-owner@example.test';
    const signup = await request(server()).post('/auth/signup').send({
      username: 'reset-owner',
      email,
      password: 'reset-journal-passphrase',
    });
    expect(signup.status).toBe(201);
    await settle();
    await clearMail();

    const forgot = await request(server())
      .post('/auth/password/forgot')
      .send({ email });
    expect(forgot.status).toBe(200);
    const token = tokenFrom(await onlyEmail());

    const tooShort = await request(server())
      .post('/auth/password/reset')
      .send({ token, password: 'short1' });
    expect(tooShort.status).toBe(400);
    expect(errorMessage(tooShort.body)).toBe(
      'Password must be at least 8 characters.',
    );
    const common = await request(server())
      .post('/auth/password/reset')
      .send({ token, password: 'password' });
    expect(common.status).toBe(400);
    expect(errorMessage(common.body)).toBe(
      'That password is too common. Choose a different one.',
    );
    const personal = await request(server())
      .post('/auth/password/reset')
      .send({ token, password: email });
    expect(personal.status).toBe(400);
    expect(errorMessage(personal.body)).toBe(
      'Password cannot be your email address.',
    );

    const updated = await request(server())
      .post('/auth/password/reset')
      .send({ token, password: 'fresh-journal-passphrase' });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ passwordUpdated: true });

    const oldLogin = await request(server()).post('/auth/login').send({
      identifier: email,
      password: 'reset-journal-passphrase',
    });
    const newLogin = await request(server()).post('/auth/login').send({
      identifier: email,
      password: 'fresh-journal-passphrase',
    });
    expect(oldLogin.status).toBe(401);
    expect(oldLogin.body.message).toBe(INVALID_CREDENTIALS);
    expect(newLogin.status).toBe(201);

    const spent = await request(server())
      .post('/auth/password/reset')
      .send({ token, password: 'another-journal-passphrase' });
    expect(spent.status).toBe(400);
    expect(errorMessage(spent.body)).toBe(INVALID_LINK);
  });

  it('deletes one account and leaves the other account untouched', async () => {
    const alpha = await request(server()).post('/auth/signup').send({
      username: 'alpha-owner',
      email: ALPHA_EMAIL,
      password: ALPHA_PASSWORD,
    });
    const beta = await request(server()).post('/auth/signup').send({
      username: 'beta-owner',
      email: BETA_EMAIL,
      password: BETA_PASSWORD,
    });
    expect(alpha.status).toBe(201);
    expect(beta.status).toBe(201);
    await settle();
    const tokenA = alpha.body.access_token as string;
    const tokenB = beta.body.access_token as string;
    const idA = await idByEmail(ALPHA_EMAIL);
    const idB = await idByEmail(BETA_EMAIL);
    const ownedA = await seedOwned(idA, 'alpha-marker');
    const ownedB = await seedOwned(idB, 'beta-marker');
    await admin.query(
      `INSERT INTO "note_tags" ("notesId", "tagsId") VALUES ($1, $2)`,
      [ownedB.noteId, ownedA.tagId],
    );
    const cross = await admin.query(
      `INSERT INTO "habit" ("name", "userId", "originNoteId")
       VALUES ('beta-cross-habit', $1, $2) RETURNING "id"`,
      [idB, ownedA.noteId],
    );
    const crossHabitId = Number(cross[0].id);

    const tables = await userOwnedTables();
    for (const name of OWNED_TABLES) expect(tables).toContain(name);
    const beforeA = await ownedCounts(idA);
    const beforeB = await ownedCounts(idB);
    for (const name of OWNED_TABLES) {
      expect(beforeA[name]).toBeGreaterThan(0);
    }
    expect(beforeA.habit_check).toBeGreaterThan(0);

    const anonymous = await request(server())
      .delete('/users/me')
      .send({ password: ALPHA_PASSWORD });
    expect(anonymous.status).toBe(401);

    const missing = await request(server())
      .delete('/users/me')
      .set(auth(tokenA))
      .send({});
    expect(missing.status).toBe(400);

    const oversized = await request(server())
      .delete('/users/me')
      .set(auth(tokenA))
      .send({ password: 'p'.repeat(1025) });
    expect(oversized.status).toBe(400);
    expect(await ownedCounts(idA)).toEqual(beforeA);

    const goneRoute = await request(server())
      .delete(`/users/${idA}`)
      .set(auth(tokenA));
    expect(goneRoute.status).toBe(404);
    expect(await ownedCounts(idA)).toEqual(beforeA);

    const wrong = await request(server())
      .delete('/users/me')
      .set(auth(tokenA))
      .send({ password: 'not-the-alpha-password' });
    const badLogin = await request(server()).post('/auth/login').send({
      identifier: BETA_EMAIL,
      password: 'not-the-beta-password',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(badLogin.body);
    expect(wrong.body.message).toBe(INVALID_CREDENTIALS);
    expect(JSON.stringify(wrong.body)).not.toContain(ALPHA_PASSWORD);
    expect(await ownedCounts(idA)).toEqual(beforeA);
    expect(await ownedCounts(idB)).toEqual(beforeB);

    await clearMail();
    const removed = await request(server())
      .delete('/users/me')
      .set(auth(tokenA))
      .send({ password: ALPHA_PASSWORD });
    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');

    const letters = (await delivered()).filter(
      (message) => message.subject === 'Your Prysmic account has been deleted',
    );
    expect(letters).toHaveLength(0);

    expect(await ownedCounts(idA)).toEqual(zeroOwned());
    expect(await ownedCounts(idB)).toEqual(beforeB);
    expect(
      await admin.query(`SELECT "id" FROM "users" WHERE "id" = $1`, [idA]),
    ).toHaveLength(0);
    expect(
      await admin.query(`SELECT "id" FROM "users" WHERE "id" = $1`, [idB]),
    ).toHaveLength(1);
    const keptNote = await admin.query(
      `SELECT "content", "userId" FROM "notes" WHERE "id" = $1`,
      [ownedB.noteId],
    );
    expect(keptNote).toEqual([{ content: 'beta-marker-body', userId: idB }]);
    expect(
      await admin.query(`SELECT "id" FROM "notes" WHERE "id" = $1`, [
        ownedA.noteId,
      ]),
    ).toHaveLength(0);
    const ownHabit = await admin.query(
      `SELECT "originNoteId" FROM "habit" WHERE "id" = $1`,
      [ownedB.habitId],
    );
    expect(Number(ownHabit[0].originNoteId)).toBe(ownedB.noteId);
    const crossHabit = await admin.query(
      `SELECT "name", "userId", "originNoteId" FROM "habit" WHERE "id" = $1`,
      [crossHabitId],
    );
    expect(crossHabit).toEqual([
      { name: 'beta-cross-habit', userId: idB, originNoteId: null },
    ]);
    expect(await orphanCounts()).toEqual({
      note_tags: 0,
      task_tags: 0,
      habit_check: 0,
      origin: 0,
      attachment_note: 0,
    });

    const notes = await request(server())
      .get(`/notes/user/${idB}`)
      .set(auth(tokenB));
    expect(notes.status).toBe(200);
    const listed = JSON.stringify(notes.body);
    expect(listed).toContain('beta-marker-body');
    expect(listed).not.toContain('alpha-marker-body');
    const hidden = await request(server())
      .get(`/notes/${ownedA.noteId}`)
      .set(auth(tokenB));
    expect(hidden.status).toBe(404);

    const denied = await request(server()).get('/users').set(auth(tokenA));
    expect(denied.status).toBe(401);
    const gone = await request(server()).post('/auth/login').send({
      identifier: ALPHA_EMAIL,
      password: ALPHA_PASSWORD,
    });
    expect(gone.status).toBe(401);
    const betaStill = await request(server()).post('/auth/login').send({
      identifier: BETA_EMAIL,
      password: BETA_PASSWORD,
    });
    expect(betaStill.status).toBe(201);
    const betaProfile = await request(server())
      .get('/users')
      .set(auth(betaStill.body.access_token as string));
    expect(betaProfile.status).toBe(200);
    expect(betaProfile.body[0].email).toBe(BETA_EMAIL);
  });

  it('rate limits repeated deletion attempts and keeps the account', async () => {
    const email = 'rate-owner@example.test';
    const signup = await request(server()).post('/auth/signup').send({
      username: 'rate-owner',
      email,
      password: 'rate-journal-passphrase',
    });
    expect(signup.status).toBe(201);
    const token = signup.body.access_token as string;
    const id = await idByEmail(email);
    await admin.query(
      `INSERT INTO "notes" ("title", "content", "userId") VALUES ('rate', 'rate-marker-body', $1)`,
      [id],
    );

    const first = await request(server())
      .delete('/users/me')
      .set(auth(token))
      .send({ password: 'wrong-rate-password' });
    const second = await request(server())
      .delete('/users/me')
      .set(auth(token))
      .send({ password: 'wrong-rate-password' });
    const third = await request(server())
      .delete('/users/me')
      .set(auth(token))
      .send({ password: 'rate-journal-passphrase' });
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toEqual(expect.any(String));
    expect(errorMessage(third.body)).toBe(RATE_LIMIT_MESSAGE);
    expect(
      await admin.query(`SELECT "id" FROM "users" WHERE "id" = $1`, [id]),
    ).toHaveLength(1);
    const note = await admin.query(
      `SELECT "content" FROM "notes" WHERE "userId" = $1 AND "content" = 'rate-marker-body'`,
      [id],
    );
    expect(note).toHaveLength(1);
    const still = await request(server()).get('/users').set(auth(token));
    expect(still.status).toBe(200);
    expect(still.body[0].email).toBe(email);
  });
});

type OwnedIds = {
  noteId: number;
  tagId: number;
  habitId: number;
  taskId: number;
};

async function seedOwned(userId: number, marker: string): Promise<OwnedIds> {
  const note = await admin.query(
    `INSERT INTO "notes" ("title", "content", "userId")
     VALUES ($1, $2, $3) RETURNING "id"`,
    [`${marker}-title`, `${marker}-body`, userId],
  );
  const tag = await admin.query(
    `INSERT INTO "tags" ("name", "color", "userId")
     VALUES ($1, 'cyan', $2) RETURNING "id"`,
    [`${marker}-tag`, userId],
  );
  await admin.query(
    `INSERT INTO "note_tags" ("notesId", "tagsId") VALUES ($1, $2)`,
    [note[0].id, tag[0].id],
  );
  const habit = await admin.query(
    `INSERT INTO "habit" ("name", "userId", "originNoteId")
     VALUES ($1, $2, $3) RETURNING "id"`,
    [`${marker}-habit`, userId, note[0].id],
  );
  await admin.query(
    `INSERT INTO "habit_check" ("habitId", "date") VALUES ($1, '2026-04-03')`,
    [habit[0].id],
  );
  const task = await admin.query(
    `INSERT INTO "task" ("title", "userId") VALUES ($1, $2) RETURNING "id"`,
    [`${marker}-task`, userId],
  );
  await admin.query(
    `INSERT INTO "task_tags" ("taskId", "tagsId") VALUES ($1, $2)`,
    [task[0].id, tag[0].id],
  );
  await admin.query(
    `INSERT INTO "mood" ("moodType", "emoji", "date", "userId")
     VALUES ($1, '✨', '2026-04-02', $2)`,
    [`${marker}-mood`, userId],
  );
  await admin.query(
    `INSERT INTO "mood_options" ("label", "emoji", "color", "userId")
     VALUES ($1, '✨', 'amber', $2)`,
    [`${marker} glow`, userId],
  );
  await admin.query(
    `INSERT INTO "calendar_event" ("userId", "title", "startDate")
     VALUES ($1, $2, '2026-04-01')`,
    [userId, `${marker}-event`],
  );
  const payload = Buffer.from(`${marker}-bytes`);
  await admin.query(
    `INSERT INTO "note_attachments"
       ("noteId", "userId", "filename", "mimeType", "size", "data")
     VALUES ($1, $2, $3, 'text/plain', $4, $5)`,
    [note[0].id, userId, `${marker}.txt`, payload.length, payload],
  );
  await admin.query(
    `INSERT INTO "auth_tokens" ("userId", "purpose", "tokenHash", "expiresAt")
     VALUES ($1, 'email_verification', $2, NOW() + INTERVAL '2 days')`,
    [userId, createHash('sha256').update(marker).digest('hex')],
  );
  return {
    noteId: Number(note[0].id),
    tagId: Number(tag[0].id),
    habitId: Number(habit[0].id),
    taskId: Number(task[0].id),
  };
}

async function userOwnedTables(): Promise<string[]> {
  const found = await admin.query(
    `SELECT c.table_name
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'userId'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name`,
  );
  return found.map((row) => String(row.table_name));
}

async function ownedCounts(userId: number): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await userOwnedTables()) {
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error(`unexpected table ${table}`);
    }
    const found = await admin.query(
      `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "userId" = $1`,
      [userId],
    );
    counts[table] = Number(found[0].n);
  }
  const checks = await admin.query(
    `SELECT COUNT(*)::int AS n
     FROM "habit_check" hc
     JOIN "habit" h ON h."id" = hc."habitId"
     WHERE h."userId" = $1`,
    [userId],
  );
  counts.habit_check = Number(checks[0].n);
  return counts;
}

function zeroOwned(): Record<string, number> {
  const counts: Record<string, number> = { habit_check: 0 };
  for (const name of OWNED_TABLES) counts[name] = 0;
  return counts;
}

async function orphanCounts(): Promise<Record<string, number>> {
  const queries: Record<string, string> = {
    note_tags: `SELECT COUNT(*)::int AS n FROM "note_tags" nt
      WHERE NOT EXISTS (SELECT 1 FROM "notes" n WHERE n."id" = nt."notesId")
         OR NOT EXISTS (SELECT 1 FROM "tags" t WHERE t."id" = nt."tagsId")`,
    task_tags: `SELECT COUNT(*)::int AS n FROM "task_tags" tt
      WHERE NOT EXISTS (SELECT 1 FROM "task" t WHERE t."id" = tt."taskId")
         OR NOT EXISTS (SELECT 1 FROM "tags" g WHERE g."id" = tt."tagsId")`,
    habit_check: `SELECT COUNT(*)::int AS n FROM "habit_check" hc
      WHERE NOT EXISTS (SELECT 1 FROM "habit" h WHERE h."id" = hc."habitId")`,
    origin: `SELECT COUNT(*)::int AS n FROM "habit" h
      WHERE h."originNoteId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "notes" n WHERE n."id" = h."originNoteId")`,
    attachment_note: `SELECT COUNT(*)::int AS n FROM "note_attachments" a
      WHERE NOT EXISTS (SELECT 1 FROM "notes" n WHERE n."id" = a."noteId")`,
  };
  const counts: Record<string, number> = {};
  for (const [name, sql] of Object.entries(queries)) {
    const found = await admin.query(sql);
    counts[name] = Number(found[0].n);
  }
  return counts;
}

async function idByEmail(email: string): Promise<number> {
  const found = await admin.query(
    `SELECT "id" FROM "users" WHERE "email" = $1`,
    [email],
  );
  if (found.length !== 1) throw new Error(`expected one user for ${email}`);
  return Number(found[0].id);
}

async function deleteAction(name: string): Promise<string> {
  const found = await admin.query(
    `SELECT confdeltype FROM pg_constraint WHERE conname = $1`,
    [name],
  );
  if (found.length !== 1) {
    throw new Error(`constraint ${name} count ${found.length}`);
  }
  const value = found[0].confdeltype;
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return String(value);
}

async function apply(direction: 'up' | 'down'): Promise<void> {
  await applyMigration(new CascadeOwnedUserData1790600000000(), direction);
}

async function applyMigration(
  migration: MigrationInterface,
  direction: 'up' | 'down',
): Promise<void> {
  const runner: QueryRunner = admin.createQueryRunner();
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

function migrationName(migration: MigrationInterface): string {
  return migration.name || migration.constructor.name;
}

async function loadMigrations(): Promise<MigrationInterface[]> {
  const dir = join(process.cwd(), 'src/migrations');
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const loaded: MigrationInterface[] = [];
  for (const file of files) {
    const imported = (await import(join(dir, file))) as Record<string, unknown>;
    const exported = Object.values(imported).find(
      (value) =>
        typeof value === 'function' &&
        value.prototype &&
        typeof value.prototype.up === 'function',
    ) as (new () => MigrationInterface) | undefined;
    if (!exported) throw new Error(`No migration class in ${file}`);
    loaded.push(new exported());
  }
  return loaded;
}

function errorMessage(body: { message?: unknown }): string {
  const message = body.message;
  if (Array.isArray(message)) return message.map(String).join(' ');
  return typeof message === 'string' ? message : '';
}

let nestApp: INestApplication;
let admin!: DataSource;

function remember(application: INestApplication): void {
  nestApp = application;
}

function server(): ReturnType<INestApplication['getHttpServer']> {
  return nestApp.getHttpServer();
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function mailbox(): ConsoleEmailProvider {
  const provider = nestApp.get<EmailProvider>(EMAIL_PROVIDER);
  if (!(provider instanceof ConsoleEmailProvider)) {
    throw new Error('expected the console email provider');
  }
  return provider;
}

async function settle(): Promise<void> {
  await nestApp.get(AccountLifecycleService).settleMail();
}

async function clearMail(): Promise<void> {
  await settle();
  mailbox().clear();
}

async function delivered(): Promise<OutboundEmail[]> {
  await settle();
  return mailbox().outbox;
}

async function onlyEmail(): Promise<OutboundEmail> {
  const sent = await delivered();
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

function ensureBuilt(): void {
  const source = join(
    process.cwd(),
    'src/migrations/1790600000000-CascadeOwnedUserData.ts',
  );
  const compiled = join(
    process.cwd(),
    'dist/migrations/1790600000000-CascadeOwnedUserData.js',
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

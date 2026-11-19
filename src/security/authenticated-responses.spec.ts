/* HTTP bodies are scanned loosely. The assertion is that no authenticated
   response carries a password hash, a session version, or a user relation. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { NoStoreInterceptor } from '../common/no-store.interceptor';
import { AuthController } from '../modules/auth/auth.controller';
import { AuthService } from '../modules/auth/auth.service';
import { AccountLifecycleService } from '../modules/auth/account-lifecycle.service';
import { JwtStrategy } from '../modules/auth/jwt.strategy';
import { AuthRateLimiter } from '../modules/auth/rate-limit';
import { EMAIL_PROVIDER } from '../modules/auth/email/email.provider.factory';
import { EmailDelivery } from '../modules/auth/email/email.delivery';
import type {
  EmailProvider,
  OutboundEmail,
} from '../modules/auth/email/email.types';
import { AuthToken } from '../modules/auth/tokens/auth-token.entity';
import { AuthTokenService } from '../modules/auth/tokens/auth-token.service';
import { RefreshSessionService } from '../modules/auth/sessions/refresh-session.service';
import { OnboardingService } from '../modules/onboarding/onboarding.service';
import { User } from '../modules/users/user.entity';
import { UserController } from '../modules/users/user.controller';
import { UserService } from '../modules/users/user.service';
import { Note } from '../modules/notes/notes.entity';
import { NoteAttachment } from '../modules/notes/note-attachment.entity';
import { NotesController } from '../modules/notes/notes.controller';
import { NoteAttachmentsController } from '../modules/notes/note-attachments.controller';
import { NotesService } from '../modules/notes/notes.service';
import { NoteAttachmentsService } from '../modules/notes/note-attachments.service';
import { Tag } from '../modules/tags/tags.entity';
import { TagsController } from '../modules/tags/tags.controller';
import { TagsService } from '../modules/tags/tags.service';
import { Task } from '../modules/tasks/tasks.entity';
import { TaskController } from '../modules/tasks/tasks.controller';
import { TaskService } from '../modules/tasks/tasks.service';
import { Habit } from '../modules/habits/habit.entity';
import { HabitCheck } from '../modules/habits/habit-check.entity';
import { HabitController } from '../modules/habits/habit.controller';
import { HabitService } from '../modules/habits/habit.service';
import { Mood } from '../modules/moods/mood.entity';
import { MoodOption } from '../modules/moods/mood-option.entity';
import { MoodController } from '../modules/moods/mood.controller';
import { MoodOptionController } from '../modules/moods/mood-option.controller';
import { MoodService } from '../modules/moods/mood.service';
import { MoodOptionService } from '../modules/moods/mood-option.service';
import { CalendarEvent } from '../modules/calendar/calendar-event.entity';
import { CalendarController } from '../modules/calendar/calendar.controller';
import { CalendarService } from '../modules/calendar/calendar.service';
import { ExportController } from '../modules/export/export.controller';
import { ExportService } from '../modules/export/export.service';

const SECRET = 'authenticated-responses-test-secret';
const PASSWORD = 'synth-journal-passphrase';
const EMAIL = 'owner@example.test';
const USERNAME = 'owner-name';
const MOOD_NOTE = 'alpha-private-mood-note';

const SECRET_KEYS = new Set([
  'password',
  'sessionversion',
  'passwordhash',
  'tokenhash',
  'hash',
  'successorseal',
  'user',
]);

type Row = Record<string, any>;

class MemoryRepo {
  rows: Row[] = [];
  private seq = 0;

  constructor(
    private readonly opts: {
      hidden?: string[];
      owner?: () => MemoryRepo;
    } = {},
  ) {}

  create(partial: Row): Row {
    return { ...partial };
  }

  async save(entity: Row | Row[]): Promise<Row | Row[]> {
    if (Array.isArray(entity)) {
      const saved: Row[] = [];
      for (const item of entity) saved.push((await this.save(item)) as Row);
      return saved;
    }
    if (!entity.id) {
      this.seq += 1;
      entity.id = this.seq;
    }
    if (!entity.createdAt) entity.createdAt = new Date();
    entity.updatedAt = new Date();
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index], ...entity };
      return this.rows[index];
    }
    this.rows.push(entity);
    return entity;
  }

  async find(options?: {
    where?: unknown;
    relations?: string[];
    order?: Record<string, 'ASC' | 'DESC' | 'asc' | 'desc'>;
    take?: number;
    skip?: number;
  }): Promise<Row[]> {
    let rows = this.rows.filter((row) => matches(row, options?.where));
    const order = options?.order;
    if (order) {
      const [key, dir] = Object.entries(order)[0] ?? [];
      if (key) {
        rows = [...rows].sort((a, b) => {
          const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
          return String(dir).toUpperCase() === 'DESC' ? -cmp : cmp;
        });
      }
    }
    const skip = options?.skip ?? 0;
    rows = rows.slice(skip);
    if (options?.take !== undefined) rows = rows.slice(0, options.take);
    return rows.map((row) => this.present(row, options?.relations));
  }

  async findOne(options?: {
    where?: unknown;
    relations?: string[];
  }): Promise<Row | null> {
    const rows = await this.find(options);
    return rows[0] ?? null;
  }

  async findOneBy(where: unknown): Promise<Row | null> {
    return this.findOne({ where });
  }

  async update(id: number, patch: Row): Promise<{ affected: number }> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return { affected: 0 };
    Object.assign(row, patch);
    return { affected: 1 };
  }

  async delete(where: unknown): Promise<{ affected: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, where));
    return { affected: before - this.rows.length };
  }

  async remove(entity: { id?: number }): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== entity.id);
  }

  async count(options?: { where?: unknown }): Promise<number> {
    return this.rows.filter((row) => matches(row, options?.where)).length;
  }

  merge(target: Row, source: Row): Row {
    Object.assign(target, source);
    return target;
  }

  createQueryBuilder(): MemoryQB {
    return new MemoryQB(this);
  }

  manager: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    getRepository: (entity: unknown) => MemoryRepo;
  } = {
    query: () => Promise.resolve([[], 0]),
    getRepository: () => this,
  };

  present(row: Row, relations?: string[], selected?: Set<string>): Row {
    const copy: Row = { ...row };
    for (const key of this.opts.hidden ?? []) {
      if (!selected?.has(key)) delete copy[key];
    }
    if (relations?.includes('user')) {
      const ownerId = copy.user?.id ?? copy.userId;
      const raw = this.opts.owner?.().rows.find((user) => user.id === ownerId);
      if (raw) copy.user = { ...raw };
    } else if ('user' in copy) {
      delete copy.user;
    }
    if (Array.isArray(copy.tags)) {
      copy.tags = copy.tags.map((tag: Row) => {
        const next = { ...tag };
        delete next.user;
        return next;
      });
    }
    return copy;
  }
}

class MemoryQB {
  private selected = new Set<string>();
  private params: Record<string, unknown> = {};
  private rowLimit?: number;

  constructor(private readonly repo: MemoryRepo) {}

  addSelect(column: string): this {
    const name = column.split('.').pop();
    if (name) this.selected.add(name);
    return this;
  }

  select(): this {
    return this;
  }

  where(_sql: string, params?: Record<string, unknown>): this {
    if (params) Object.assign(this.params, params);
    return this;
  }

  andWhere(sql: string, params?: Record<string, unknown>): this {
    return this.where(sql, params);
  }

  leftJoinAndSelect(): this {
    return this;
  }

  innerJoin(): this {
    return this;
  }

  orderBy(): this {
    return this;
  }

  addOrderBy(): this {
    return this;
  }

  take(n: number): this {
    this.rowLimit = n;
    return this;
  }

  limit(n: number): this {
    this.rowLimit = n;
    return this;
  }

  skip(): this {
    return this;
  }

  groupBy(): this {
    return this;
  }

  loadRelationCountAndMap(): this {
    return this;
  }

  async getMany(): Promise<Row[]> {
    let rows = this.repo.rows.filter((row) => this.matches(row));
    if (this.rowLimit !== undefined) rows = rows.slice(0, this.rowLimit);
    return rows.map((row) => this.repo.present(row, undefined, this.selected));
  }

  async getOne(): Promise<Row | null> {
    const rows = await this.getMany();
    return rows[0] ?? null;
  }

  async getRawMany(): Promise<Row[]> {
    return [];
  }

  async getRawOne(): Promise<Row> {
    return { rows: 0, count: 0 };
  }

  private matches(row: Row): boolean {
    const { id, userId, username, email, noteId, attachmentId } = this.params;
    if (id !== undefined && Number(row.id) !== Number(id)) return false;
    if (
      userId !== undefined &&
      row.userId !== undefined &&
      Number(row.userId) !== Number(userId)
    ) {
      return false;
    }
    if (
      username !== undefined &&
      row.username !== undefined &&
      String(row.username).toLowerCase() !== String(username).toLowerCase()
    ) {
      return false;
    }
    if (
      email !== undefined &&
      row.email !== undefined &&
      String(row.email).toLowerCase() !== String(email).toLowerCase()
    ) {
      return false;
    }
    if (
      noteId !== undefined &&
      row.noteId !== undefined &&
      Number(row.noteId) !== Number(noteId)
    ) {
      return false;
    }
    if (attachmentId !== undefined && Number(row.id) !== Number(attachmentId)) {
      return false;
    }
    return true;
  }
}

class ExportQB {
  private fields: string[] | null = null;
  private params: Record<string, unknown> = {};

  constructor(private readonly users: MemoryRepo) {}

  select(fields?: string | string[]): this {
    if (Array.isArray(fields)) this.fields = fields;
    return this;
  }

  addSelect(): this {
    return this;
  }

  where(_sql: string, params?: Record<string, unknown>): this {
    if (params) Object.assign(this.params, params);
    return this;
  }

  andWhere(sql: string, params?: Record<string, unknown>): this {
    return this.where(sql, params);
  }

  innerJoin(): this {
    return this;
  }

  orderBy(): this {
    return this;
  }

  addOrderBy(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  async getRawOne(): Promise<Row> {
    return { rows: 1, textBytes: 0 };
  }

  async getRawMany(): Promise<Row[]> {
    return [];
  }

  async getMany(): Promise<Row[]> {
    return [];
  }

  async getOne(): Promise<Row | null> {
    const id = Number(this.params.userId ?? this.params.id);
    const raw = this.users.rows.find((user) => user.id === id);
    if (!raw) return null;
    if (!this.fields) return { ...raw };
    const projected: Row = {};
    for (const field of this.fields) {
      const key = field.includes('.') ? field.split('.').pop() : field;
      if (key) projected[key] = raw[key];
    }
    return projected;
  }
}

function matches(row: Row, where: unknown): boolean {
  if (where == null) return true;
  if (Array.isArray(where)) return where.some((item) => matches(row, item));
  if (typeof where !== 'object') return false;
  for (const [key, expected] of Object.entries(where as Row)) {
    if (!matchesValue(row[key], expected, row, key)) return false;
  }
  return true;
}

function matchesValue(
  actual: unknown,
  expected: unknown,
  row: Row,
  key: string,
): boolean {
  if (
    expected &&
    typeof expected === 'object' &&
    '_type' in (expected as Row)
  ) {
    const operator = expected as { _type: string; _value: unknown };
    const type = String(operator._type).toLowerCase();
    const value = operator._value as any;
    if (actual == null) return false;
    if (type === 'in') return Array.isArray(value) && value.includes(actual);
    if (type === 'between') return actual >= value[0] && actual <= value[1];
    if (type === 'morethanorequal' || type === 'morethanorequalto') {
      return actual >= value;
    }
    return false;
  }
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    if (actual && typeof actual === 'object') {
      return matches(actual as Row, expected);
    }
    const ownerId = (expected as Row).id;
    if (ownerId !== undefined && key === 'user') {
      return (
        row.userId === ownerId || (row.user as Row | undefined)?.id === ownerId
      );
    }
    return false;
  }
  return actual === expected;
}

function secretPaths(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      secretPaths(item, `${path}[${index}]`),
    );
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.startsWith('$2')) {
      return [`${path} looks like a bcrypt hash`];
    }
    return [];
  }
  return Object.entries(value as Row).flatMap(([key, child]) => {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const here = SECRET_KEYS.has(norm) ? [`${path}.${key}`] : [];
    return here.concat(secretPaths(child, `${path}.${key}`));
  });
}

function tokenPayload(token: string): { sv?: number; sub?: number } {
  return JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  );
}

describe('authenticated responses omit secrets', () => {
  let app: INestApplication;
  let users: MemoryRepo;
  const mailbox: EmailProvider & { sent: OutboundEmail[] } = {
    sent: [],
    isConfigured: () => true,
    send: (message) => {
      mailbox.sent.push(message);
      return Promise.resolve();
    },
  };
  const sessions = {
    tokens: new Map<string, number>(),
    issue(userId: number): Promise<string> {
      const raw = `refresh-${userId}-${this.tokens.size + 1}`;
      this.tokens.set(raw, userId);
      return Promise.resolve(raw);
    },
    rotate(raw: string | null) {
      const userId = raw ? this.tokens.get(raw) : undefined;
      if (!raw || userId === undefined) {
        return Promise.resolve({
          ok: false as const,
          reason: 'revoked' as const,
        });
      }
      this.tokens.delete(raw);
      const refreshToken = `refresh-${userId}-rotated-${this.tokens.size + 1}`;
      this.tokens.set(refreshToken, userId);
      return Promise.resolve({
        ok: true as const,
        userId,
        refreshToken,
      });
    },
    revokePresented(raw: string | null): Promise<void> {
      if (raw) this.tokens.delete(raw);
      return Promise.resolve();
    },
    revokeAllForUser(userId: number): Promise<void> {
      for (const [token, owner] of this.tokens) {
        if (owner === userId) this.tokens.delete(token);
      }
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    users = new MemoryRepo({ hidden: ['password', 'sessionVersion'] });
    const notes = new MemoryRepo({ owner: () => users });
    const attachments = new MemoryRepo({
      hidden: ['data'],
      owner: () => users,
    });
    const tags = new MemoryRepo({ owner: () => users });
    const tasks = new MemoryRepo({ owner: () => users });
    const habits = new MemoryRepo({ owner: () => users });
    const checks = new MemoryRepo();
    const moods = new MemoryRepo({ owner: () => users });
    const options = new MemoryRepo({ owner: () => users });
    const events = new MemoryRepo({ owner: () => users });
    const tokens = new MemoryRepo();
    tags.manager.getRepository = (entity: unknown) => {
      if (entity === Note) return notes;
      if (entity === Task) return tasks;
      return tags;
    };
    users.manager.query = (sql: string, params: unknown[] = []) => {
      if (sql.includes('SET "password"')) {
        const user = users.rows.find((row) => row.id === Number(params[1]));
        if (!user) return Promise.resolve([[], 0]);
        user.password = String(params[0]);
        user.sessionVersion = Number(user.sessionVersion ?? 0) + 1;
        return Promise.resolve([
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
        ]);
      }
      if (sql.includes('FOR UPDATE')) {
        const user = users.rows.find((row) => row.id === Number(params[0]));
        return Promise.resolve(user ? [{ id: user.id }] : []);
      }
      if (sql.includes('DELETE FROM "users"')) {
        const id = Number(params[0]);
        const index = users.rows.findIndex((row) => row.id === id);
        if (index < 0) return Promise.resolve([[], 0]);
        users.rows.splice(index, 1);
        return Promise.resolve([[{ id }], 1]);
      }
      return Promise.resolve([[], 0]);
    };

    const dataSource = {
      transaction: (
        work: (manager: { query: typeof users.manager.query }) => unknown,
      ) => work({ query: users.manager.query }),
      createQueryRunner: () => ({
        connect: () => Promise.resolve(),
        startTransaction: () => Promise.resolve(),
        commitTransaction: () => Promise.resolve(),
        rollbackTransaction: () => Promise.resolve(),
        release: () => Promise.resolve(),
        query: () => Promise.resolve(),
        manager: {
          getRepository: () => ({
            createQueryBuilder: () => new ExportQB(users),
          }),
        },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              JWT_SECRET: SECRET,
              APP_URL: 'http://localhost:3000',
              NODE_ENV: 'test',
            }),
          ],
        }),
        PassportModule,
        JwtModule.register({
          secret: SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [
        AuthController,
        UserController,
        MoodController,
        MoodOptionController,
        NotesController,
        NoteAttachmentsController,
        TagsController,
        TaskController,
        HabitController,
        CalendarController,
        ExportController,
      ],
      providers: [
        AuthService,
        UserService,
        JwtStrategy,
        AuthRateLimiter,
        AccountLifecycleService,
        AuthTokenService,
        EmailDelivery,
        MoodService,
        MoodOptionService,
        NotesService,
        NoteAttachmentsService,
        TagsService,
        TaskService,
        HabitService,
        CalendarService,
        ExportService,
        { provide: EMAIL_PROVIDER, useValue: mailbox },
        {
          provide: OnboardingService,
          useValue: { seedDefaultMoods: () => Promise.resolve() },
        },
        { provide: RefreshSessionService, useValue: sessions },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(AuthToken), useValue: tokens },
        { provide: getRepositoryToken(Note), useValue: notes },
        { provide: getRepositoryToken(NoteAttachment), useValue: attachments },
        { provide: getRepositoryToken(Tag), useValue: tags },
        { provide: getRepositoryToken(Task), useValue: tasks },
        { provide: getRepositoryToken(Habit), useValue: habits },
        { provide: getRepositoryToken(HabitCheck), useValue: checks },
        { provide: getRepositoryToken(Mood), useValue: moods },
        { provide: getRepositoryToken(MoodOption), useValue: options },
        { provide: getRepositoryToken(CalendarEvent), useValue: events },
        { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
        { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
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

  function server() {
    return app.getHttpServer();
  }

  function scan(label: string, body: unknown, text = ''): void {
    const found = secretPaths(body);
    for (const row of users.rows) {
      if (typeof row.password === 'string' && text.includes(row.password)) {
        found.push(`${label} body contains a stored password hash`);
      }
    }
    expect({ label, found }).toEqual({ label, found: [] });
  }

  it('serves every authenticated route without password, sessionVersion, or user', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: USERNAME,
      email: EMAIL,
      password: PASSWORD,
    });
    expect(signup.status).toBe(201);
    scan('POST /auth/signup', signup.body, JSON.stringify(signup.body));
    expect(signup.headers['cache-control']).toBe('no-store');

    const stored = users.rows.find((row) => row.email === EMAIL);
    expect(stored?.password).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    stored!.sessionVersion = 2;

    const login = await request(server()).post('/auth/login').send({
      identifier: EMAIL,
      password: PASSWORD,
    });
    expect(login.status).toBe(201);
    scan('POST /auth/login', login.body, JSON.stringify(login.body));
    expect(login.headers['cache-control']).toBe('no-store');
    const access = login.body.access_token as string;
    expect(tokenPayload(access).sv).toBe(2);
    const auth = { Authorization: `Bearer ${access}` };
    const cookie = cookiePair(login.headers['set-cookie']);

    const me = await request(server()).get('/users').set(auth);
    expect(me.status).toBe(200);
    scan('GET /users', me.body, JSON.stringify(me.body));
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.body[0].tourSeenAt).toBeNull();
    expect(me.body[0].password).toBeUndefined();
    expect(me.body[0].sessionVersion).toBeUndefined();
    const userId = me.body[0].id as number;

    const seen = await request(server())
      .patch('/users/me/tour')
      .set(auth)
      .send({});
    expect(seen.status).toBe(200);
    scan('PATCH /users/me/tour', seen.body, JSON.stringify(seen.body));
    expect(typeof seen.body.tourSeenAt).toBe('string');
    expect(seen.body.password).toBeUndefined();
    expect(seen.body.sessionVersion).toBeUndefined();
    expect(seen.headers['cache-control']).toBe('no-store');
    const cleared = await request(server())
      .patch('/users/me/tour')
      .set(auth)
      .send({ seen: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ tourSeenAt: null });
    scan(
      'PATCH /users/me/tour clear',
      cleared.body,
      JSON.stringify(cleared.body),
    );
    expect(stored?.password).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    expect(stored?.sessionVersion).toBe(2);

    const self = await request(server()).get(`/users/${userId}`).set(auth);
    const byName = await request(server())
      .get(`/users/username/${USERNAME}`)
      .set(auth);
    const byEmail = await request(server())
      .get(`/users/email/${EMAIL}`)
      .set(auth);
    const renamed = await request(server())
      .put(`/users/${userId}`)
      .set(auth)
      .send({ username: 'owner-renamed' });
    for (const [label, res] of [
      ['GET /users/:id', self],
      ['GET /users/username/:username', byName],
      ['GET /users/email/:email', byEmail],
      ['PUT /users/:id', renamed],
    ] as const) {
      expect(res.status).toBe(200);
      scan(label, res.body, JSON.stringify(res.body));
      expect(res.headers['cache-control']).toBe('no-store');
    }

    const tag = await request(server())
      .post('/tags')
      .set(auth)
      .send({ name: 'gratitude', color: 'amber' });
    expect(tag.status).toBe(201);
    scan('POST /tags', tag.body, JSON.stringify(tag.body));
    expect(tag.body.user).toBeUndefined();
    const tagId = tag.body.id as number;

    const tags = await request(server()).get('/tags').set(auth);
    const oneTag = await request(server()).get(`/tags/${tagId}`).set(auth);
    const tagPut = await request(server())
      .put(`/tags/${tagId}`)
      .set(auth)
      .send({ name: 'gratitude', color: 'cyan' });
    for (const [label, res] of [
      ['GET /tags', tags],
      ['GET /tags/:id', oneTag],
      ['PUT /tags/:id', tagPut],
    ] as const) {
      expect(res.status).toBe(200);
      scan(label, res.body, JSON.stringify(res.body));
      expect(JSON.stringify(res.body)).not.toContain('"user"');
    }

    const note = await request(server())
      .post('/notes')
      .set(auth)
      .send({ title: 'Morning', content: '<p>quiet</p>', tagIds: [tagId] });
    expect(note.status).toBe(201);
    scan('POST /notes', note.body, JSON.stringify(note.body));
    expect(note.body.user).toBeUndefined();
    const noteId = note.body.id as number;

    const noteList = await request(server())
      .get(`/notes/user/${userId}`)
      .set(auth);
    const noteOne = await request(server()).get(`/notes/${noteId}`).set(auth);
    const notePut = await request(server())
      .put(`/notes/${noteId}`)
      .set(auth)
      .send({ title: 'Morning', content: '<p>quiet still</p>' });
    for (const [label, res] of [
      ['GET /notes/user/:userId', noteList],
      ['GET /notes/:id', noteOne],
      ['PUT /notes/:id', notePut],
    ] as const) {
      expect(res.status).toBe(200);
      scan(label, res.body, JSON.stringify(res.body));
      expect(res.body.user ?? res.body[0]?.user).toBeUndefined();
    }

    const uploaded = await request(server())
      .post(`/notes/${noteId}/attachments`)
      .set(auth)
      .attach('file', Buffer.from('hello'), 'note.txt');
    expect(uploaded.status).toBe(201);
    scan(
      'POST /notes/:id/attachments',
      uploaded.body,
      JSON.stringify(uploaded.body),
    );
    const attachmentId = uploaded.body.id as number;
    const listed = await request(server())
      .get(`/notes/${noteId}/attachments`)
      .set(auth);
    expect(listed.status).toBe(200);
    scan(
      'GET /notes/:id/attachments',
      listed.body,
      JSON.stringify(listed.body),
    );
    const raw = await request(server())
      .get(`/notes/${noteId}/attachments/${attachmentId}/raw`)
      .set(auth);
    expect(raw.status).toBe(200);
    expect(raw.headers['cache-control']).toBe('private, max-age=3600');
    expect(raw.text ?? '').not.toContain(String(stored!.password));

    const task = await request(server())
      .post('/tasks')
      .set(auth)
      .send({ title: 'Write', tagIds: [tagId] });
    expect(task.status).toBe(201);
    scan('POST /tasks', task.body, JSON.stringify(task.body));
    expect(task.body.user).toBeUndefined();
    const taskId = task.body.id as number;
    for (const [label, method, url, body] of [
      ['GET /tasks', 'get', '/tasks', undefined],
      ['GET /tasks/:id', 'get', `/tasks/${taskId}`, undefined],
      [
        'PATCH /tasks/:id',
        'patch',
        `/tasks/${taskId}`,
        { title: 'Write more' },
      ],
      ['POST /tasks/:id/archive', 'post', `/tasks/${taskId}/archive`, {}],
      ['POST /tasks/:id/unarchive', 'post', `/tasks/${taskId}/unarchive`, {}],
      ['POST /tasks/:id/complete', 'post', `/tasks/${taskId}/complete`, {}],
      ['POST /tasks/:id/uncomplete', 'post', `/tasks/${taskId}/uncomplete`, {}],
    ] as const) {
      const res = await (request(server()) as any)
        [method](url)
        .set(auth)
        .send(body);
      expect({ label, status: res.status }).toEqual({
        label,
        status: expect.any(Number),
      });
      expect(res.status).toBeLessThan(300);
      scan(label, res.body, JSON.stringify(res.body));
      expect(res.headers['cache-control']).toBe('no-store');
    }

    const habit = await request(server())
      .post('/habits')
      .set(auth)
      .send({ name: 'Walk' });
    expect(habit.status).toBe(201);
    scan('POST /habits', habit.body, JSON.stringify(habit.body));
    expect(habit.body.user).toBeUndefined();
    const habitId = habit.body.id as number;
    const habitRoutes: Array<[string, string, string, unknown]> = [
      ['GET /habits', 'get', '/habits', undefined],
      ['GET /habits/:id', 'get', `/habits/${habitId}`, undefined],
      [
        'GET /habits/:id/checkins',
        'get',
        `/habits/${habitId}/checkins?from=2026-11-01&to=2026-11-19`,
        undefined,
      ],
      [
        'POST /habits/:id/check',
        'post',
        `/habits/${habitId}/check`,
        { date: '2026-11-19' },
      ],
      [
        'PUT /habits/:id',
        'put',
        `/habits/${habitId}`,
        { name: 'Walk farther' },
      ],
    ];
    for (const [label, method, url, body] of habitRoutes) {
      const res = await (request(server()) as any)
        [method](url)
        .set(auth)
        .send(body);
      expect(res.status).toBeLessThan(300);
      scan(label, res.body, JSON.stringify(res.body));
    }

    const mood = await request(server()).post('/moods').set(auth).send({
      moodType: 'Calm',
      emoji: '🌿',
      color: 'cyan',
      note: MOOD_NOTE,
      date: '2026-11-19',
    });
    expect(mood.status).toBe(200);
    scan('POST /moods', mood.body, JSON.stringify(mood.body));
    expect(mood.body.user).toBeUndefined();
    expect(mood.body.note).toBe(MOOD_NOTE);
    const moodId = mood.body.id as number;
    const moodUpdated = await request(server()).post('/moods').set(auth).send({
      moodType: 'Calm',
      emoji: '🌊',
      note: MOOD_NOTE,
      date: '2026-11-19',
    });
    expect(moodUpdated.status).toBe(200);
    scan(
      'POST /moods update',
      moodUpdated.body,
      JSON.stringify(moodUpdated.body),
    );
    expect(moodUpdated.body.user).toBeUndefined();
    expect(moodUpdated.body.emoji).toBe('🌊');

    const today = await request(server())
      .get('/moods/today')
      .query({ today: '2026-11-19' })
      .set(auth);
    const history = await request(server()).get('/moods/history').set(auth);
    const allMoods = await request(server()).get('/moods').set(auth);
    for (const [label, res] of [
      ['GET /moods/today', today],
      ['GET /moods/history', history],
      ['GET /moods', allMoods],
    ] as const) {
      expect(res.status).toBe(200);
      scan(label, res.body, JSON.stringify(res.body));
      expect(res.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(res.body)).not.toContain('"user"');
      expect(JSON.stringify(res.body)).toContain(MOOD_NOTE);
    }

    const option = await request(server())
      .post('/mood-options')
      .set(auth)
      .send({ label: 'Steady', emoji: '🌿', color: 'cyan' });
    expect(option.status).toBe(201);
    scan('POST /mood-options', option.body, JSON.stringify(option.body));
    expect(option.body.user).toBeUndefined();
    const optionId = option.body.id as number;
    const optionList = await request(server()).get('/mood-options').set(auth);
    const optionPut = await request(server())
      .put(`/mood-options/${optionId}`)
      .set(auth)
      .send({ label: 'Steadier' });
    for (const [label, res] of [
      ['GET /mood-options', optionList],
      ['PUT /mood-options/:id', optionPut],
    ] as const) {
      expect(res.status).toBe(200);
      scan(label, res.body, JSON.stringify(res.body));
      expect(JSON.stringify(res.body)).not.toContain('"user"');
    }

    const event = await request(server())
      .post('/calendar/events')
      .set(auth)
      .send({ title: 'Focus', startDate: '2026-11-19' });
    expect(event.status).toBe(201);
    scan('POST /calendar/events', event.body, JSON.stringify(event.body));
    expect(event.body.user).toBeUndefined();
    const eventId = event.body.id as number;
    const feed = await request(server())
      .get('/calendar')
      .query({ from: '2026-11-01', to: '2026-11-30' })
      .set(auth);
    const eventOne = await request(server())
      .get(`/calendar/events/${eventId}`)
      .set(auth);
    const eventPatch = await request(server())
      .patch(`/calendar/events/${eventId}`)
      .set(auth)
      .send({ title: 'Focus block' });
    for (const [label, res] of [
      ['GET /calendar', feed],
      ['GET /calendar/events/:id', eventOne],
      ['PATCH /calendar/events/:id', eventPatch],
    ] as const) {
      expect(res.status).toBe(200);
      scan(label, res.body, JSON.stringify(res.body));
      expect(JSON.stringify(res.body)).not.toContain('"password"');
    }

    const exported = await request(server()).get('/export').set(auth);
    expect(exported.status).toBe(200);
    scan('GET /export', exported.body, JSON.stringify(exported.body));
    expect(exported.headers['cache-control']).toBe('private, no-store');
    expect(exported.body.account.email).toBe(EMAIL);
    expect(exported.body.account.password).toBeUndefined();

    const other = await request(server()).post('/auth/signup').send({
      username: 'other-name',
      email: 'other@example.test',
      password: PASSWORD,
    });
    expect(other.status).toBe(201);
    const otherToken = other.body.access_token as string;
    const otherAuth = { Authorization: `Bearer ${otherToken}` };
    const otherToday = await request(server())
      .get('/moods/today')
      .query({ today: '2026-11-19' })
      .set(otherAuth);
    const otherMoods = await request(server()).get('/moods').set(otherAuth);
    const otherUser = await request(server())
      .get(`/users/${userId}`)
      .set(otherAuth);
    expect(otherToday.status).toBe(200);
    expect(otherToday.body?.note).toBeUndefined();
    expect(JSON.stringify(otherToday.body ?? null)).not.toContain(MOOD_NOTE);
    expect(JSON.stringify(otherMoods.body)).not.toContain(MOOD_NOTE);
    expect(otherUser.status).toBe(404);
    scan(
      'GET /moods other user',
      otherMoods.body,
      JSON.stringify(otherMoods.body),
    );
    scan(
      'GET /users/:id other user',
      otherUser.body,
      JSON.stringify(otherUser.body),
    );

    const refreshed = await request(server())
      .post('/auth/refresh')
      .set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    scan('POST /auth/refresh', refreshed.body, JSON.stringify(refreshed.body));
    expect(tokenPayload(refreshed.body.access_token).sv).toBe(2);
    expect(refreshed.headers['cache-control']).toBe('no-store');

    const changed = await request(server())
      .post('/auth/password/change')
      .set(auth)
      .send({
        currentPassword: PASSWORD,
        newPassword: 'replacement-journal-passphrase',
      });
    expect(changed.status).toBe(200);
    scan(
      'POST /auth/password/change',
      changed.body,
      JSON.stringify(changed.body),
    );
    expect(tokenPayload(changed.body.access_token).sv).toBe(3);
    const stale = await request(server()).get('/moods').set(auth);
    expect(stale.status).toBe(401);
    scan('GET /moods stale token', stale.body, JSON.stringify(stale.body));

    const freshAuth = {
      Authorization: `Bearer ${changed.body.access_token}`,
    };
    const still = await request(server())
      .get('/moods/today')
      .query({ today: '2026-11-19' })
      .set(freshAuth);
    expect(still.status).toBe(200);
    expect(still.body.note).toBe(MOOD_NOTE);
    expect(still.body.user).toBeUndefined();

    const loggedOut = await request(server())
      .post('/auth/logout')
      .set('Cookie', cookie);
    expect(loggedOut.status).toBe(200);
    scan('POST /auth/logout', loggedOut.body, JSON.stringify(loggedOut.body));

    const verify = await request(server())
      .post('/auth/email/verify')
      .send({ token: 'not-a-real-token' });
    const resend = await request(server())
      .post('/auth/email/resend')
      .send({ email: EMAIL });
    const forgot = await request(server())
      .post('/auth/password/forgot')
      .send({ email: EMAIL });
    const reset = await request(server())
      .post('/auth/password/reset')
      .send({
        token: 'not-a-real-token',
        password: 'another-journal-passphrase',
      });
    for (const [label, res] of [
      ['POST /auth/email/verify', verify],
      ['POST /auth/email/resend', resend],
      ['POST /auth/password/forgot', forgot],
      ['POST /auth/password/reset', reset],
    ] as const) {
      scan(label, res.body, JSON.stringify(res.body));
      expect(JSON.stringify(res.body)).not.toContain(String(stored!.password));
    }

    const removedMood = await request(server())
      .delete(`/moods/${moodId}`)
      .set(freshAuth);
    const removedOption = await request(server())
      .delete(`/mood-options/${optionId}`)
      .set(freshAuth);
    const removedAttachment = await request(server())
      .delete(`/notes/${noteId}/attachments/${attachmentId}`)
      .set(freshAuth);
    const removedTask = await request(server())
      .delete(`/tasks/${taskId}`)
      .set(freshAuth);
    const removedHabit = await request(server())
      .delete(`/habits/${habitId}`)
      .set(freshAuth);
    const removedEvent = await request(server())
      .delete(`/calendar/events/${eventId}`)
      .set(freshAuth);
    const removedNote = await request(server())
      .delete(`/notes/${noteId}`)
      .set(freshAuth);
    const spare = await request(server())
      .post('/tags')
      .set(freshAuth)
      .send({ name: 'spare', color: 'slate' });
    const removedTag = await request(server())
      .delete(`/tags/${spare.body.id}`)
      .set(freshAuth);
    for (const [label, res] of [
      ['DELETE /moods/:id', removedMood],
      ['DELETE /mood-options/:id', removedOption],
      ['DELETE /notes/:id/attachments/:id', removedAttachment],
      ['DELETE /tasks/:id', removedTask],
      ['DELETE /habits/:id', removedHabit],
      ['DELETE /calendar/events/:id', removedEvent],
      ['DELETE /notes/:id', removedNote],
      ['DELETE /tags/:id', removedTag],
    ] as const) {
      expect(res.status).toBeLessThan(300);
      scan(label, res.body, JSON.stringify(res.body ?? {}));
    }

    const otherId = tokenPayload(otherToken).sub;
    const removedAccount = await request(server())
      .delete('/users/me')
      .set(otherAuth)
      .send({ password: PASSWORD });
    expect(removedAccount.status).toBe(204);
    scan(
      'DELETE /users/me',
      removedAccount.body,
      JSON.stringify(removedAccount.body ?? {}),
    );
    expect(users.rows.some((row) => row.id === otherId)).toBe(false);
    expect(users.rows.some((row) => row.id === userId)).toBe(true);
  });
});

function cookiePair(header: string | string[] | undefined): string {
  const line = Array.isArray(header) ? header[0] : header;
  return line?.split(';')[0] ?? '';
}

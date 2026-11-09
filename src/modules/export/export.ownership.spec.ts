import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { UserService } from '../users/user.service';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Task } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import { EXPORT_BUDGET } from './export.constants';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

/* In-memory rows and supertest bodies are loose on purpose.
   The assertions are the export contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-account-export-secret';
const HASH_A = 'synthetic-hash-alpha';
const HASH_B = 'synthetic-hash-beta';
const HASH_EMPTY = 'synthetic-hash-empty';
const BYTE_SENTINEL = 'attachment-bytes-sentinel-alpha';
const FOREIGN_BYTE_SENTINEL = 'attachment-bytes-sentinel-beta';
const SCRIPT_TOKEN = 'secret-script-token';

const USER_A = 1;
const USER_B = 2;
const USER_EMPTY = 3;
const USER_BOUNDS = 4;

type Row = Record<string, unknown> & { id: number };

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function idList(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    (value as { type?: string }).type === 'in'
  ) {
    return ((value as { value: unknown[] }).value ?? [])
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry));
  }
  const single = asNumber(value);
  return single === undefined ? undefined : [single];
}

function matches(
  row: Row,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  if ('userId' in where && row.userId !== asNumber(where.userId)) return false;
  if (where.user && typeof where.user === 'object') {
    const owner = asNumber((where.user as { id?: unknown }).id);
    if (owner !== undefined && row.userId !== owner) return false;
  }
  if ('id' in where && row.id !== asNumber(where.id)) return false;
  const habitIds = idList(where.habitId);
  if (habitIds && !habitIds.includes(Number(row.habitId))) return false;
  const noteIds = idList(where.noteId);
  if (noteIds && !noteIds.includes(Number(row.noteId))) return false;
  return true;
}

function ordered(rows: Row[], order?: Record<string, 'ASC' | 'DESC'>): Row[] {
  if (!order) return rows;
  const keys = Object.keys(order);
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const dir = order[key] === 'DESC' ? -1 : 1;
      const left = a[key];
      const right = b[key];
      if (left === right) continue;
      if (left == null) return -1 * dir;
      if (right == null) return 1 * dir;
      if (left < right) return -1 * dir;
      if (left > right) return 1 * dir;
    }
    return 0;
  });
}

function createMemory() {
  let writes = 0;
  const refuseWrite = () => {
    writes += 1;
    throw new Error('export must not write');
  };

  const users: Row[] = [
    {
      id: USER_A,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
      password: HASH_A,
      createdAt: new Date('2024-01-02T00:00:00.000Z'),
      userId: USER_A,
    },
    {
      id: USER_B,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: HASH_B,
      createdAt: new Date('2024-06-03T00:00:00.000Z'),
      userId: USER_B,
    },
    {
      id: USER_EMPTY,
      username: 'synth-empty',
      email: 'synth-empty@example.test',
      password: HASH_EMPTY,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      userId: USER_EMPTY,
    },
    {
      id: USER_BOUNDS,
      username: 'synth-bounds',
      email: 'synth-bounds@example.test',
      password: 'synthetic-hash-bounds',
      createdAt: new Date('2025-02-02T00:00:00.000Z'),
      userId: USER_BOUNDS,
    },
  ];

  const tags: Row[] = [
    { id: 11, userId: USER_A, name: 'reflections', color: 'cyan' },
    { id: 12, userId: USER_A, name: 'shared-label', color: 'emerald' },
    {
      id: 22,
      userId: USER_B,
      name: 'beta-tag-secret',
      color: 'rose',
      user: { id: USER_B, password: HASH_B },
    },
  ];

  const longHtml =
    `<p>Hello <strong>世界</strong> &amp; café</p>` +
    `<script>${SCRIPT_TOKEN}</script>` +
    `<p>${'河'.repeat(700)}</p>`;

  const notes: Row[] = [
    {
      id: 101,
      userId: USER_A,
      title: 'Pond note',
      content: longHtml,
      isPinned: true,
      isArchived: false,
      createdAt: new Date('2024-05-01T08:00:00.000Z'),
      updatedAt: new Date('2026-02-02T09:30:00.000Z'),
      tagIds: [11, 22],
    },
    {
      id: 201,
      userId: USER_B,
      title: 'beta-note-secret',
      content: '<p>beta-private-secret-body</p>',
      isPinned: false,
      isArchived: false,
      createdAt: new Date('2024-07-01T00:00:00.000Z'),
      updatedAt: new Date('2024-07-02T00:00:00.000Z'),
      tagIds: [22],
    },
  ];

  for (let i = 0; i < EXPORT_BUDGET.notes + 1; i += 1) {
    notes.push({
      id: 5000 + i,
      userId: USER_BOUNDS,
      title: `bounds-note-${i}`,
      content: 'bounds body',
      isPinned: false,
      isArchived: false,
      createdAt: new Date('2025-03-03T00:00:00.000Z'),
      updatedAt: new Date('2025-03-03T00:00:00.000Z'),
      tagIds: [],
    });
  }

  const tasks: Row[] = [
    {
      id: 301,
      userId: USER_A,
      title: 'Ship the export',
      description: 'Keep the tag graph',
      isComplete: false,
      isArchived: false,
      priority: 1,
      dueDate: new Date('2026-12-01T00:00:00.000Z'),
      completedAt: null,
      archivedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      tagIds: [12, 22],
    },
    {
      id: 302,
      userId: USER_B,
      title: 'beta-task-secret',
      description: 'beta task body',
      isComplete: true,
      isArchived: false,
      priority: 3,
      dueDate: null,
      completedAt: new Date('2026-04-04T00:00:00.000Z'),
      archivedAt: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      tagIds: [22],
    },
  ];

  const habits: Row[] = [
    {
      id: 401,
      userId: USER_A,
      name: 'Morning pages',
      description: 'Write before the day starts',
      intent: 'clarity',
      affirmation: 'I keep what matters',
      color: 'cyan',
      icon: 'pen',
      frequency: 'daily',
      isActive: true,
      originNoteId: 201,
      createdAt: new Date('2026-01-10T00:00:00.000Z'),
      updatedAt: new Date('2026-01-11T00:00:00.000Z'),
    },
    {
      id: 402,
      userId: USER_B,
      name: 'beta-habit-secret',
      description: 'beta habit',
      intent: null,
      affirmation: null,
      color: 'rose',
      icon: null,
      frequency: 'weekly',
      isActive: true,
      originNoteId: 201,
      createdAt: new Date('2026-02-10T00:00:00.000Z'),
      updatedAt: new Date('2026-02-10T00:00:00.000Z'),
    },
  ];

  const checks: Row[] = [
    {
      id: 501,
      habitId: 401,
      userId: USER_A,
      date: '2026-11-02',
      createdAt: new Date('2026-11-02T07:00:00.000Z'),
    },
    {
      id: 503,
      habitId: 401,
      userId: USER_A,
      date: '2026-11-01',
      createdAt: new Date('2026-11-01T07:00:00.000Z'),
    },
    {
      id: 502,
      habitId: 402,
      userId: USER_B,
      date: '2024-01-09',
      createdAt: new Date('2024-01-09T07:00:00.000Z'),
    },
  ];

  const moodOptions: Row[] = [
    {
      id: 601,
      userId: USER_A,
      label: 'Grateful',
      emoji: '🕊️',
      color: 'amber',
      sortOrder: 1,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    },
    {
      id: 602,
      userId: USER_B,
      label: 'beta-mood-option-secret',
      emoji: '🔥',
      color: 'red',
      sortOrder: 0,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    },
  ];

  const moods: Row[] = [
    {
      id: 701,
      userId: USER_A,
      moodType: 'Grateful',
      emoji: '🕊️',
      color: 'amber',
      note: 'grateful for 星',
      date: '2026-03-08',
      backfilled: false,
      createdAt: new Date('2026-03-08T22:15:00.000Z'),
    },
    {
      id: 702,
      userId: USER_B,
      moodType: 'beta-mood-secret',
      emoji: '🔥',
      color: 'red',
      note: 'beta-mood-note-secret',
      date: '2026-04-09',
      backfilled: true,
      createdAt: new Date('2026-04-09T22:15:00.000Z'),
    },
  ];

  const events: Row[] = [
    {
      id: 801,
      userId: USER_A,
      title: 'Read the pond note',
      description: 'Linked to my own note',
      allDay: false,
      startDate: '2026-11-08',
      endDate: null,
      startTime: '09:30:00',
      endTime: '10:00:00',
      color: 'cyan',
      location: 'desk',
      recurrence: 'none',
      recurrenceEndDate: null,
      linkedType: 'note',
      linkedId: 101,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    },
    {
      id: 802,
      userId: USER_A,
      title: 'Foreign link event',
      description: 'Points at someone else',
      allDay: true,
      startDate: '2026-11-09',
      endDate: '2026-11-10',
      startTime: null,
      endTime: null,
      color: 'slate',
      location: null,
      recurrence: 'weekly',
      recurrenceEndDate: '2026-12-31',
      linkedType: 'note',
      linkedId: 201,
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
      updatedAt: new Date('2026-11-02T00:00:00.000Z'),
    },
    {
      id: 803,
      userId: USER_B,
      title: 'beta-event-secret',
      description: 'beta event',
      allDay: true,
      startDate: '2026-05-05',
      endDate: null,
      startTime: null,
      endTime: null,
      color: 'rose',
      location: null,
      recurrence: 'none',
      recurrenceEndDate: null,
      linkedType: 'note',
      linkedId: 201,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    },
  ];

  const attachments: Row[] = [
    {
      id: 901,
      noteId: 101,
      userId: USER_A,
      filename: 'sketch.png',
      mimeType: 'image/png',
      size: 1200,
      createdAt: new Date('2026-02-02T10:00:00.000Z'),
      data: Buffer.from(BYTE_SENTINEL),
    },
    {
      id: 902,
      noteId: 101,
      userId: USER_B,
      filename: 'foreign-user-on-alpha-note.txt',
      mimeType: 'text/plain',
      size: 4,
      createdAt: new Date('2026-02-03T10:00:00.000Z'),
      data: Buffer.from('nope'),
    },
    {
      id: 903,
      noteId: 201,
      userId: USER_B,
      filename: 'beta-secret.pdf',
      mimeType: 'application/pdf',
      size: 50,
      createdAt: new Date('2026-02-04T10:00:00.000Z'),
      data: Buffer.from(FOREIGN_BYTE_SENTINEL),
    },
  ];

  const tables: Record<string, Row[]> = {
    users,
    notes,
    tags,
    tasks,
    habits,
    checks,
    moods,
    moodOptions,
    events,
    attachments,
  };
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  function repo(table: string, withTags = false) {
    const rows = tables[table];
    return {
      async count(options?: { where?: Record<string, unknown> }) {
        return rows.filter((row) => matches(row, options?.where)).length;
      },
      async find(options?: {
        where?: Record<string, unknown>;
        order?: Record<string, 'ASC' | 'DESC'>;
        relations?: string[];
      }) {
        return ordered(
          rows.filter((row) => matches(row, options?.where)),
          options?.order,
        ).map((row) => {
          const copy = { ...row };
          if (withTags && options?.relations?.includes('tags')) {
            copy.tags = ((row.tagIds as number[]) ?? []).map((id) => ({
              ...(tagById.get(id) ?? { id, name: 'missing', userId: 0 }),
            }));
          }
          return copy;
        });
      },
      async findOne(options?: { where?: Record<string, unknown> }) {
        const found = rows.find((row) => matches(row, options?.where));
        return found ? { ...found } : null;
      },
      createQueryBuilder() {
        const state: {
          userId?: number;
          limit?: number;
          joinTags: boolean;
          joinHabit: boolean;
          fields: string[];
        } = { joinTags: false, joinHabit: false, fields: [] };
        const ownedRows = () =>
          rows.filter(
            (row) =>
              state.userId === undefined ||
              row.userId === state.userId ||
              row.id === state.userId,
          );
        const strip = (row: Row) => {
          const copy = { ...row };
          delete copy.password;
          delete copy.data;
          delete copy.user;
          return copy;
        };
        const qb = {
          select: (field: string) => {
            state.fields = [field];
            return qb;
          },
          addSelect: (field: string) => {
            state.fields.push(field);
            return qb;
          },
          where: (_sql: string, params?: { userId?: number }) => {
            if (params?.userId != null) state.userId = Number(params.userId);
            return qb;
          },
          andWhere: (_sql: string, params?: { userId?: number }) => {
            if (params?.userId != null) state.userId = Number(params.userId);
            return qb;
          },
          innerJoin: (path: string) => {
            if (path.includes('tags')) state.joinTags = true;
            if (path.includes('habit')) state.joinHabit = true;
            return qb;
          },
          orderBy: () => qb,
          addOrderBy: () => qb,
          limit: (n: number) => {
            state.limit = n;
            return qb;
          },
          take: (n: number) => {
            state.limit = n;
            return qb;
          },
          async getRawOne() {
            if (state.joinTags) {
              const pairs = ownedRows().reduce((sum, row) => {
                const ids = (row.tagIds as number[] | undefined) ?? [];
                return (
                  sum +
                  ids.filter((id) => tagById.get(id)?.userId === state.userId)
                    .length
                );
              }, 0);
              return { rows: pairs, textBytes: 0 };
            }
            const matched = state.joinHabit
              ? checks.filter((check) =>
                  habits.some(
                    (habit) =>
                      habit.id === check.habitId &&
                      habit.userId === state.userId,
                  ),
                )
              : ownedRows();
            let textBytes = 0;
            const expr = state.fields.join(' ');
            for (const row of matched) {
              for (const key of [
                'title',
                'content',
                'name',
                'description',
                'intent',
                'affirmation',
                'note',
                'moodType',
                'label',
                'emoji',
                'location',
                'filename',
                'mimeType',
                'color',
                'icon',
                'username',
                'email',
              ]) {
                const field = row[key];
                if (expr.includes(`.${key}`) && typeof field === 'string') {
                  textBytes += Buffer.byteLength(field);
                }
              }
            }
            return { rows: matched.length, textBytes };
          },
          async getCount() {
            if (state.joinTags) {
              return ownedRows().reduce((sum, row) => {
                const ids = (row.tagIds as number[] | undefined) ?? [];
                return (
                  sum +
                  ids.filter((id) => tagById.get(id)?.userId === state.userId)
                    .length
                );
              }, 0);
            }
            return ownedRows().length;
          },
          async getOne() {
            const found = ownedRows()[0];
            return found ? strip(found) : null;
          },
          async getMany() {
            let matched = ownedRows();
            if (state.joinHabit) {
              const habitIds = new Set(
                habits
                  .filter((habit) => habit.userId === state.userId)
                  .map((habit) => habit.id),
              );
              matched = checks
                .filter((check) => habitIds.has(check.habitId as number))
                .sort(
                  (a, b) =>
                    String(a.date).localeCompare(String(b.date)) || a.id - b.id,
                );
            } else {
              matched = [...matched].sort((a, b) => a.id - b.id);
            }
            if (state.limit !== undefined) {
              matched = matched.slice(0, state.limit);
            }
            return matched.map(strip);
          },
          async getRawMany() {
            const expr = state.fields.join(' ');
            if (expr.includes('originNoteId')) {
              return habits
                .filter((habit) => habit.userId === state.userId)
                .map((habit) => ({
                  id: habit.id,
                  originNoteId: habit.originNoteId ?? null,
                }));
            }
            if (state.joinTags) {
              const pairs: {
                noteId?: number;
                taskId?: number;
                tagId: number;
              }[] = [];
              for (const row of ownedRows()) {
                for (const tagId of (row.tagIds as number[] | undefined) ??
                  []) {
                  if (tagById.get(tagId)?.userId !== state.userId) continue;
                  pairs.push(
                    table === 'tasks'
                      ? { taskId: row.id, tagId }
                      : { noteId: row.id, tagId },
                  );
                }
              }
              return state.limit !== undefined
                ? pairs.slice(0, state.limit)
                : pairs;
            }
            return [];
          },
        };
        return qb;
      },
      save: refuseWrite,
      insert: refuseWrite,
      update: refuseWrite,
      delete: refuseWrite,
      remove: refuseWrite,
    };
  }

  const repos = new Map<unknown, ReturnType<typeof repo>>([
    [User, repo('users')],
    [Note, repo('notes', true)],
    [Tag, repo('tags')],
    [Task, repo('tasks', true)],
    [Habit, repo('habits')],
    [HabitCheck, repo('checks')],
    [Mood, repo('moods')],
    [MoodOption, repo('moodOptions')],
    [CalendarEvent, repo('events')],
    [NoteAttachment, repo('attachments')],
  ]);

  const dataSource = {
    createQueryRunner: () => ({
      connect: async () => undefined,
      startTransaction: async () => undefined,
      query: async () => undefined,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      release: async () => undefined,
      manager: {
        getRepository: (entity: unknown) => {
          const found = repos.get(entity);
          if (!found) throw new Error('unexpected repository');
          return found;
        },
      },
    }),
  };

  return { writes: () => writes, dataSource };
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) =>
        key === 'password' ||
        key === 'data' ||
        key === 'access_token' ||
        key === 'user' ||
        hasForbiddenKey(nested),
    );
  }
  return false;
}

describe('Account export', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let tokenEmpty: string;
  let tokenBounds: string;
  let writes: () => number;

  beforeAll(async () => {
    const memory = createMemory();
    writes = memory.writes;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: TEST_JWT_SECRET })],
        }),
        PassportModule,
      ],
      controllers: [ExportController],
      providers: [
        ExportService,
        JwtStrategy,
        {
          provide: UserService,
          useValue: {
            findById: (id: number) =>
              Promise.resolve({
                id,
                sessionVersion: 0,
                username: 'synth',
                email: 'synth@example.test',
              }),
          },
        },
        { provide: DataSource, useValue: memory.dataSource },
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

    const jwt = new JwtService({
      secret: TEST_JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    });
    tokenA = jwt.sign({
      sub: USER_A,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
    });
    tokenB = jwt.sign({
      sub: USER_B,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
    });
    tokenEmpty = jwt.sign({
      sub: USER_EMPTY,
      username: 'synth-empty',
      email: 'synth-empty@example.test',
    });
    tokenBounds = jwt.sign({
      sub: USER_BOUNDS,
      username: 'synth-bounds',
      email: 'synth-bounds@example.test',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('rejects an unauthenticated, invalid, or expired token', async () => {
    const missing = await request(server()).get('/export');
    expect(missing.status).toBe(401);
    expect(JSON.stringify(missing.body)).not.toContain('Pond note');
    expect(JSON.stringify(missing.body)).not.toContain(HASH_A);

    const invalid = await request(server())
      .get('/export')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(invalid.status).toBe(401);
    expect(JSON.stringify(invalid.body)).not.toContain('Pond note');

    const wrongKey = new JwtService({ secret: 'different-test-secret' });
    const forged = wrongKey.sign({
      sub: USER_A,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
    });
    const forgedResponse = await request(server())
      .get('/export')
      .set(auth(forged));
    expect(forgedResponse.status).toBe(401);

    const expired = new JwtService({
      secret: TEST_JWT_SECRET,
    }).sign(
      {
        sub: USER_A,
        username: 'synth-owner-a',
        email: 'synth-a@example.test',
      },
      { expiresIn: '-1s' },
    );
    const expiredResponse = await request(server())
      .get('/export')
      .set(auth(expired));
    expect(expiredResponse.status).toBe(401);
    expect(JSON.stringify(expiredResponse.body)).not.toContain('Pond note');
    expect(JSON.stringify(expiredResponse.body)).not.toContain(HASH_A);
  });

  it('exports an empty account as a complete snapshot with no secrets', async () => {
    const response = await request(server())
      .get('/export')
      .set(auth(tokenEmpty));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.format).toBe('prysmic.account-export');
    expect(response.body.version).toBe(1);
    expect(response.body.account).toEqual({
      id: USER_EMPTY,
      username: 'synth-empty',
      email: 'synth-empty@example.test',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    expect(response.body.coverage.notes.count).toBe(0);
    expect(response.body.notes).toEqual([]);
    expect(response.body.tags).toEqual([]);
    expect(response.body.tasks).toEqual([]);
    expect(response.body.habits).toEqual([]);
    expect(response.body.moods).toEqual([]);
    expect(response.body.moodOptions).toEqual([]);
    expect(response.body.calendarEvents).toEqual([]);
    expect(response.body.coverage.habitChecks.count).toBe(0);
    expect(hasForbiddenKey(response.body)).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain(HASH_EMPTY);
    expect(writes()).toBe(0);
  });

  it('exports the caller graph and drops other accounts, foreign links, and file bytes', async () => {
    const response = await request(server()).get('/export').set(auth(tokenA));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="prysmic-export-',
    );
    expect(response.headers['content-disposition']).toContain('.json"');

    const body = response.body;
    expect(body.account.email).toBe('synth-a@example.test');
    expect(body.coverage).toMatchObject({
      notes: {
        included: true,
        count: 1,
        content: 'html-and-text',
        attachments: 'metadata-only-bytes-excluded',
      },
      tags: { included: true, count: 2, linkedFrom: ['notes', 'tasks'] },
      tasks: { count: 1 },
      habits: { count: 1, checks: 'nested-on-each-habit' },
      habitChecks: { count: 2 },
      moods: { count: 1 },
      moodOptions: { count: 1 },
      calendarEvents: { count: 2 },
    });

    expect(body.tags.map((tag: { name: string }) => tag.name).sort()).toEqual([
      'reflections',
      'shared-label',
    ]);
    const note = body.notes[0];
    expect(note.title).toBe('Pond note');
    expect(note.contentHtml).toContain('<strong>世界</strong>');
    expect(note.contentHtml).toContain(SCRIPT_TOKEN);
    expect(note.contentHtml.length).toBeGreaterThan(600);
    expect(note.contentText).toContain('Hello');
    expect(note.contentText).toContain('世界');
    expect(note.contentText).toContain('&');
    expect(note.contentText).toContain('café');
    expect(note.contentText).toContain('河'.repeat(50));
    expect(note.contentText).not.toContain(SCRIPT_TOKEN);
    expect(note.contentText).not.toContain('<script');
    expect(note.tagIds).toEqual([11]);
    expect(note.isPinned).toBe(true);
    expect(note.createdAt).toBe('2024-05-01T08:00:00.000Z');
    expect(note.attachments).toEqual([
      {
        id: 901,
        filename: 'sketch.png',
        mimeType: 'image/png',
        size: 1200,
        createdAt: '2026-02-02T10:00:00.000Z',
        bytesIncluded: false,
      },
    ]);

    expect(body.tasks[0].tagIds).toEqual([12]);
    expect(body.tasks[0].priority).toBe(1);
    expect(body.tasks[0].dueDate).toBe('2026-12-01T00:00:00.000Z');

    expect(body.habits[0].name).toBe('Morning pages');
    expect(body.habits[0].originNoteId).toBeNull();
    expect(
      body.habits[0].checks.map((check: { date: string }) => check.date),
    ).toEqual(['2026-11-01', '2026-11-02']);

    expect(body.moodOptions[0].emoji).toBe('🕊️');
    expect(body.moods[0]).toMatchObject({
      moodType: 'Grateful',
      note: 'grateful for 星',
      date: '2026-03-08',
      backfilled: false,
    });

    const linked = body.calendarEvents.find(
      (event: { id: number }) => event.id === 801,
    );
    const dropped = body.calendarEvents.find(
      (event: { id: number }) => event.id === 802,
    );
    expect(linked.link).toEqual({ type: 'note', id: 101 });
    expect(linked.startDate).toBe('2026-11-08');
    expect(linked.startTime).toBe('09:30:00');
    expect(dropped.link).toBeNull();
    expect(dropped.recurrence).toBe('weekly');
    expect(dropped.recurrenceEndDate).toBe('2026-12-31');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(HASH_A);
    expect(serialized).not.toContain(HASH_B);
    expect(serialized).not.toContain('beta-note-secret');
    expect(serialized).not.toContain('beta-private-secret-body');
    expect(serialized).not.toContain('beta-tag-secret');
    expect(serialized).not.toContain('beta-task-secret');
    expect(serialized).not.toContain('beta-habit-secret');
    expect(serialized).not.toContain('beta-mood-secret');
    expect(serialized).not.toContain('beta-mood-note-secret');
    expect(serialized).not.toContain('beta-event-secret');
    expect(serialized).not.toContain('beta-secret.pdf');
    expect(serialized).not.toContain(BYTE_SENTINEL);
    expect(serialized).not.toContain(FOREIGN_BYTE_SENTINEL);
    expect(serialized).not.toContain('foreign-user-on-alpha-note');
    expect(serialized).not.toContain('synth-b@example.test');
    expect(serialized).not.toContain(tokenA);
    expect(hasForbiddenKey(body)).toBe(false);
    expect(writes()).toBe(0);
  });

  it('keeps the other account on its own export', async () => {
    const response = await request(server()).get('/export').set(auth(tokenB));
    expect(response.status).toBe(200);
    const titles = response.body.notes.map(
      (note: { title: string }) => note.title,
    );
    expect(titles).toEqual(['beta-note-secret']);
    expect(titles).not.toContain('Pond note');
    expect(response.body.habits[0].originNoteId).toBe(201);
    expect(response.body.calendarEvents[0].link).toEqual({
      type: 'note',
      id: 201,
    });
    expect(JSON.stringify(response.body)).not.toContain('Morning pages');
    expect(JSON.stringify(response.body)).not.toContain(HASH_B);
    expect(hasForbiddenKey(response.body)).toBe(false);
  });

  it('refuses an oversized account without returning a partial snapshot', async () => {
    const response = await request(server())
      .get('/export')
      .set(auth(tokenBounds));
    expect(response.status).toBe(413);
    expect(response.body.format).toBeUndefined();
    expect(JSON.stringify(response.body)).toContain('No file was produced');
    expect(JSON.stringify(response.body)).not.toContain('bounds-note-');
    expect(writes()).toBe(0);
  });
});

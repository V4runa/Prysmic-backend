import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AuthRateLimiter } from '../auth/rate-limit';
import { AuthToken } from '../auth/tokens/auth-token.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { TagsController } from '../tags/tags.controller';
import { TagsService } from '../tags/tags.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { Task } from './tasks.entity';
import { TaskController } from './tasks.controller';
import { TaskService } from './tasks.service';

/* In-memory repositories. The Postgres spec covers the real joins. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-task-tags-secret';
const USER_A_ID = 101;
const USER_B_ID = 202;
const PASSWORD_A = 'synthetic-password-hash-a';
const PASSWORD_B = 'synthetic-password-hash-b';
const TAG_WORK_ID = 11;
const TAG_HOME_ID = 12;
const TAG_FREE_ID = 13;
const TAG_SECRET_ID = 22;
const TASK_ALPHA_ID = 501;
const TASK_BETA_ID = 502;
const TASK_PLAIN_ID = 503;
const TASK_ARCHIVED_ID = 504;
const TASK_SECRET_ID = 601;

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
  sessionVersion: number;
};

type StoredTag = {
  id: number;
  name: string;
  color?: string;
  user: { id: number };
};

type StoredNote = {
  id: number;
  userId: number;
  tags: StoredTag[];
};

type StoredTask = {
  id: number;
  userId: number;
  title: string;
  description?: string;
  isComplete: boolean;
  isArchived: boolean;
  priority: number;
  dueDate?: string | Date;
  completedAt?: Date | null;
  archivedAt?: Date | null;
  tags: Array<Pick<StoredTag, 'id' | 'name' | 'color'>>;
  createdAt: Date;
  updatedAt: Date;
  user?: StoredUser;
};

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
    return ((value as { value: unknown[] }).value ?? []).map((entry) =>
      Number(entry),
    );
  }
  const single = asNumber(value);
  return single === undefined ? undefined : [single];
}

function publicTag(tag: StoredTag): Pick<StoredTag, 'id' | 'name' | 'color'> {
  return { id: tag.id, name: tag.name, color: tag.color };
}

function createMemory() {
  const users: StoredUser[] = [
    {
      id: USER_A_ID,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
      password: PASSWORD_A,
      sessionVersion: 0,
    },
    {
      id: USER_B_ID,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: PASSWORD_B,
      sessionVersion: 0,
    },
  ];
  const tags: StoredTag[] = [
    { id: TAG_WORK_ID, name: 'work', color: 'cyan', user: { id: USER_A_ID } },
    { id: TAG_HOME_ID, name: 'home', color: 'amber', user: { id: USER_A_ID } },
    { id: TAG_FREE_ID, name: 'later', color: 'blue', user: { id: USER_A_ID } },
    {
      id: TAG_SECRET_ID,
      name: 'beta-secret-tag',
      color: 'rose',
      user: { id: USER_B_ID },
    },
  ];
  const notes: StoredNote[] = [
    { id: 1001, userId: USER_A_ID, tags: [tags[0]] },
    { id: 2002, userId: USER_B_ID, tags: [tags[3]] },
  ];
  const tasks: StoredTask[] = [
    {
      id: TASK_ALPHA_ID,
      userId: USER_A_ID,
      title: 'alpha task',
      isComplete: false,
      isArchived: false,
      priority: 2,
      tags: [publicTag(tags[0]), publicTag(tags[1])],
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: TASK_BETA_ID,
      userId: USER_A_ID,
      title: 'beta task',
      isComplete: false,
      isArchived: false,
      priority: 2,
      tags: [publicTag(tags[0])],
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    },
    {
      id: TASK_PLAIN_ID,
      userId: USER_A_ID,
      title: 'plain task',
      isComplete: false,
      isArchived: false,
      priority: 2,
      tags: [],
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      updatedAt: new Date('2026-01-04T00:00:00.000Z'),
    },
    {
      id: TASK_ARCHIVED_ID,
      userId: USER_A_ID,
      title: 'archived task',
      isComplete: false,
      isArchived: true,
      priority: 2,
      tags: [publicTag(tags[0])],
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
      updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    },
    {
      id: TASK_SECRET_ID,
      userId: USER_B_ID,
      title: 'beta-secret-task',
      isComplete: false,
      isArchived: false,
      priority: 2,
      tags: [publicTag(tags[3])],
      createdAt: new Date('2026-01-06T00:00:00.000Z'),
      updatedAt: new Date('2026-01-06T00:00:00.000Z'),
    },
  ];

  let taskSeq = 7000;
  let tagCountQueries = 0;

  function copyTask(task: StoredTask): StoredTask {
    const { user: _user, ...rest } = task;
    void _user;
    return {
      ...rest,
      tags: task.tags.map((tag) => ({ ...tag })),
    };
  }

  const taskRepo = {
    create(
      partial: Partial<StoredTask> & { user?: { id: number } },
    ): StoredTask {
      const userId = partial.userId || partial.user?.id || 0;
      return {
        id: partial.id ?? 0,
        userId,
        title: partial.title ?? '',
        description: partial.description,
        isComplete: partial.isComplete ?? false,
        isArchived: partial.isArchived ?? false,
        priority: partial.priority ?? 2,
        dueDate: partial.dueDate,
        completedAt: partial.completedAt ?? null,
        archivedAt: partial.archivedAt ?? null,
        tags: (partial.tags ?? []).map((tag) => ({ ...tag })),
        createdAt: partial.createdAt ?? new Date(),
        updatedAt: new Date(),
      };
    },
    async save(task: StoredTask): Promise<StoredTask> {
      if (!task.id) task.id = ++taskSeq;
      const stored = copyTask(task);
      const index = tasks.findIndex((row) => row.id === stored.id);
      if (index >= 0) tasks[index] = stored;
      else tasks.push(stored);
      return copyTask(stored);
    },
    async findOne(options?: {
      where?: { id?: unknown };
      relations?: string[];
    }): Promise<StoredTask | null> {
      const id = asNumber(options?.where?.id);
      const found = tasks.find((row) => row.id === id);
      return found ? copyTask(found) : null;
    },
    async remove(task: StoredTask): Promise<void> {
      const index = tasks.findIndex((row) => row.id === task.id);
      if (index >= 0) tasks.splice(index, 1);
    },
    createQueryBuilder() {
      const state: {
        userId?: number;
        archived?: boolean;
        complete?: boolean;
        priority?: number;
        search?: string;
        tagId?: number;
        sortBy?: string;
        order?: string;
        take?: number;
        skip?: number;
      } = {};
      const qb = {
        leftJoinAndSelect: () => qb,
        where: (_sql: string, params?: { userId?: unknown }) => {
          if (params && 'userId' in params)
            state.userId = asNumber(params.userId);
          return qb;
        },
        andWhere: (_sql: string, params?: Record<string, unknown>) => {
          if (params && 'archived' in params) {
            state.archived = Boolean(params.archived);
          }
          if (params && 'complete' in params) {
            state.complete = Boolean(params.complete);
          }
          if (params && 'priority' in params) {
            state.priority = asNumber(params.priority);
          }
          if (params && 'search' in params)
            state.search = String(params.search);
          return qb;
        },
        innerJoin: (
          _property: string,
          _alias: string,
          _condition?: string,
          params?: { tagId?: unknown },
        ) => {
          if (params && 'tagId' in params) state.tagId = asNumber(params.tagId);
          return qb;
        },
        orderBy: (column: string, order?: string) => {
          state.sortBy = column.replace(/^task\./, '');
          state.order = order;
          return qb;
        },
        take: (n: number) => {
          state.take = Number(n);
          return qb;
        },
        skip: (n: number) => {
          state.skip = Number(n);
          return qb;
        },
        getMany: async () => {
          let rows = tasks.filter(
            (row) => state.userId === undefined || row.userId === state.userId,
          );
          if (state.archived !== undefined) {
            rows = rows.filter((row) => row.isArchived === state.archived);
          }
          if (state.complete !== undefined) {
            rows = rows.filter((row) => row.isComplete === state.complete);
          }
          if (state.priority !== undefined) {
            rows = rows.filter((row) => row.priority === state.priority);
          }
          if (state.search) {
            const term = state.search.replace(/%/g, '').toLowerCase();
            rows = rows.filter((row) => row.title.toLowerCase().includes(term));
          }
          if (state.tagId !== undefined) {
            rows = rows.filter((row) =>
              row.tags.some((tag) => tag.id === state.tagId),
            );
          }
          if (state.sortBy === 'title') {
            const dir = state.order === 'DESC' ? -1 : 1;
            rows = [...rows].sort(
              (a, b) => a.title.localeCompare(b.title) * dir,
            );
          }
          const skip = state.skip ?? 0;
          rows = rows.slice(skip);
          if (state.take !== undefined) rows = rows.slice(0, state.take);
          return rows.map((row) => copyTask(row));
        },
      };
      return qb;
    },
  };

  const tagRepo = {
    async find(options?: {
      where?: { id?: unknown; name?: string; user?: { id?: unknown } };
      order?: { name?: 'ASC' | 'DESC' };
    }): Promise<Array<Pick<StoredTag, 'id' | 'name' | 'color'>>> {
      const where = options?.where ?? {};
      const ids = idList(where.id);
      const ownerId =
        where.user && 'id' in where.user ? asNumber(where.user.id) : undefined;
      let rows = tags.filter((tag) => (ids ? ids.includes(tag.id) : true));
      rows = rows.filter((tag) =>
        ownerId === undefined ? true : tag.user.id === ownerId,
      );
      rows = rows.filter((tag) =>
        where.name ? tag.name === where.name : true,
      );
      if (options?.order?.name === 'ASC') {
        rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
      }
      return rows.map((tag) => publicTag(tag));
    },
    async findOne(options?: {
      where?: { id?: unknown; name?: string; user?: { id?: unknown } };
    }): Promise<Pick<StoredTag, 'id' | 'name' | 'color'> | null> {
      const rows = await tagRepo.find(options);
      return rows[0] ?? null;
    },
    async remove(tag: { id: number }): Promise<void> {
      const index = tags.findIndex((row) => row.id === Number(tag.id));
      if (index >= 0) tags.splice(index, 1);
    },
    manager: {
      getRepository(entity: unknown) {
        const rows = entity === Note ? notes : entity === Task ? tasks : null;
        if (!rows) {
          throw new Error('Unexpected repository in tag usage count');
        }
        return {
          createQueryBuilder() {
            tagCountQueries += 1;
            const state: { ids?: number[] } = {};
            const qb = {
              innerJoin: () => qb,
              select: () => qb,
              addSelect: () => qb,
              where: (_sql: string, params?: { ids?: unknown[] }) => {
                if (params && Array.isArray(params.ids)) {
                  state.ids = params.ids.map((id) => Number(id));
                }
                return qb;
              },
              groupBy: () => qb,
              getRawMany: async () => {
                const counts = new Map<number, number>();
                for (const row of rows) {
                  for (const tag of row.tags) {
                    if (state.ids && !state.ids.includes(tag.id)) continue;
                    counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
                  }
                }
                return [...counts.entries()].map(([id, count]) => ({
                  id,
                  count,
                }));
              },
            };
            return qb;
          },
        };
      },
    },
  };

  const userRepo = {
    async findOne(options?: {
      where?: { id?: unknown };
    }): Promise<StoredUser | null> {
      const id = asNumber(options?.where?.id);
      const found = users.find((user) => user.id === id);
      return found ? { ...found } : null;
    },
    async findOneBy(where?: { id?: unknown }): Promise<StoredUser | null> {
      const id = asNumber(where?.id);
      const found = users.find((user) => user.id === id);
      return found ? { ...found } : null;
    },
  };

  return {
    taskRepo,
    tagRepo,
    userRepo,
    countQueries: () => tagCountQueries,
  };
}

describe('Task and tag sharing (controller + service)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let countQueries: () => number;

  beforeEach(async () => {
    const memory = createMemory();
    countQueries = memory.countQueries;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: TEST_JWT_SECRET })],
        }),
        PassportModule,
      ],
      controllers: [TaskController, TagsController],
      providers: [
        TaskService,
        TagsService,
        UserService,
        AuthRateLimiter,
        JwtStrategy,
        { provide: getRepositoryToken(Task), useValue: memory.taskRepo },
        { provide: getRepositoryToken(Tag), useValue: memory.tagRepo },
        { provide: getRepositoryToken(User), useValue: memory.userRepo },
        {
          provide: getRepositoryToken(AuthToken),
          useValue: { manager: {} },
        },
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
      sub: USER_A_ID,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
    });
    tokenB = jwt.sign({
      sub: USER_B_ID,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tagIds = (body: { tags?: Array<{ id: number }> }) =>
    (body.tags ?? []).map((tag) => tag.id).sort((a, b) => a - b);

  it('rejects unauthenticated task and tag calls', async () => {
    expect((await request(server()).get('/tasks')).status).toBe(401);
    expect((await request(server()).post('/tasks')).status).toBe(401);
    expect((await request(server()).get('/tags')).status).toBe(401);
    expect((await request(server()).delete('/tags/11')).status).toBe(401);
  });

  it('saves owned tags and rejects foreign, unknown, and duplicate ids', async () => {
    const created = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({
        title: 'ship-tags',
        description: 'both',
        tagIds: [TAG_WORK_ID, TAG_HOME_ID],
      } satisfies CreateTaskDto);
    expect(created.status).toBe(201);
    expect(created.body.userId).toBe(USER_A_ID);
    expect(created.body.user).toBeUndefined();
    expect(tagIds(created.body)).toEqual([TAG_WORK_ID, TAG_HOME_ID]);
    expect(created.body.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: TAG_WORK_ID,
          name: 'work',
          color: 'cyan',
        }),
        expect.objectContaining({
          id: TAG_HOME_ID,
          name: 'home',
          color: 'amber',
        }),
      ]),
    );
    expect(JSON.stringify(created.body)).not.toContain(PASSWORD_A);
    expect(JSON.stringify(created.body)).not.toContain('beta-secret-tag');

    const bare = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'no-tags' });
    expect(bare.status).toBe(201);
    expect(bare.body.tags).toEqual([]);

    const foreign = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'nope', tagIds: [TAG_SECRET_ID] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.message).toBe(
      'Some of the provided tag IDs do not exist',
    );
    expect(JSON.stringify(foreign.body)).not.toContain('beta-secret-tag');

    const unknown = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'missing', tagIds: [999] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toBe(
      'Some of the provided tag IDs do not exist',
    );

    const duplicate = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'dupes', tagIds: [TAG_WORK_ID, TAG_WORK_ID] });
    expect(duplicate.status).toBe(400);

    const strings = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'strings', tagIds: ['11'] });
    expect(strings.status).toBe(400);

    const moved = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'owned-by-token', tagIds: [], userId: USER_B_ID });
    expect(moved.status).toBe(400);
  });

  it('keeps tags when tagIds is omitted, clears them for an empty list, and will not apply a foreign id', async () => {
    const created = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'keep-or-clear', tagIds: [TAG_WORK_ID, TAG_HOME_ID] });
    const id = created.body.id as number;

    const renamed = await request(server())
      .patch(`/tasks/${id}`)
      .set(auth(tokenA))
      .send({ title: 'renamed-only' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.title).toBe('renamed-only');
    expect(tagIds(renamed.body)).toEqual([TAG_WORK_ID, TAG_HOME_ID]);

    const nulled = await request(server())
      .patch(`/tasks/${id}`)
      .set(auth(tokenA))
      .send({ tagIds: null });
    expect(nulled.status).toBe(200);
    expect(nulled.body.tags).toEqual([]);
    expect(nulled.body.title).toBe('renamed-only');

    const replaced = await request(server())
      .patch(`/tasks/${id}`)
      .set(auth(tokenA))
      .send({ tagIds: [TAG_HOME_ID] });
    expect(replaced.status).toBe(200);
    expect(tagIds(replaced.body)).toEqual([TAG_HOME_ID]);

    const rejected = await request(server())
      .patch(`/tasks/${id}`)
      .set(auth(tokenA))
      .send({ title: 'should-not-stick', tagIds: [TAG_SECRET_ID] });
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toBe(
      'Some of the provided tag IDs do not exist',
    );

    const read = await request(server()).get(`/tasks/${id}`).set(auth(tokenA));
    expect(read.status).toBe(200);
    expect(read.body.title).toBe('renamed-only');
    expect(tagIds(read.body)).toEqual([TAG_HOME_ID]);
    expect(read.body.tags[0]).toEqual(
      expect.objectContaining({
        id: TAG_HOME_ID,
        name: 'home',
        color: 'amber',
      }),
    );

    const cleared = await request(server())
      .patch(`/tasks/${id}`)
      .set(auth(tokenA))
      .send({ tagIds: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.tags).toEqual([]);
  });

  it('returns tags on the list and filters by tagId without hiding sibling tags', async () => {
    const listed = await request(server()).get('/tasks').set(auth(tokenA));
    expect(listed.status).toBe(200);
    const titles = listed.body.map((task: { title: string }) => task.title);
    expect(titles).toContain('alpha task');
    expect(titles).toContain('plain task');
    expect(titles).not.toContain('archived task');
    expect(titles).not.toContain('beta-secret-task');
    const alpha = listed.body.find(
      (task: { id: number }) => task.id === TASK_ALPHA_ID,
    );
    expect(tagIds(alpha)).toEqual([TAG_WORK_ID, TAG_HOME_ID]);
    expect(JSON.stringify(listed.body)).not.toContain(PASSWORD_A);
    expect(JSON.stringify(listed.body)).not.toContain('beta-secret');

    const filtered = await request(server())
      .get(`/tasks?tagId=${TAG_WORK_ID}`)
      .set(auth(tokenA));
    expect(filtered.status).toBe(200);
    expect(
      filtered.body.map((task: { title: string }) => task.title).sort(),
    ).toEqual(['alpha task', 'beta task']);
    const filteredAlpha = filtered.body.find(
      (task: { id: number }) => task.id === TASK_ALPHA_ID,
    );
    expect(tagIds(filteredAlpha)).toEqual([TAG_WORK_ID, TAG_HOME_ID]);

    const foreignFilter = await request(server())
      .get(`/tasks?tagId=${TAG_SECRET_ID}`)
      .set(auth(tokenA));
    expect(foreignFilter.status).toBe(200);
    expect(foreignFilter.body).toEqual([]);

    const bogus = await request(server())
      .get('/tasks?tagId=nope')
      .set(auth(tokenA));
    expect(bogus.status).toBe(400);
    expect(bogus.body.message).toBe(
      'Validation failed (numeric string is expected)',
    );

    const archived = await request(server())
      .get(`/tasks?archived=true&tagId=${TAG_WORK_ID}`)
      .set(auth(tokenA));
    expect(archived.body.map((task: { title: string }) => task.title)).toEqual([
      'archived task',
    ]);

    const hidden = await request(server())
      .get(`/tasks/${TASK_SECRET_ID}`)
      .set(auth(tokenA));
    expect(hidden.status).toBe(403);
    expect(JSON.stringify(hidden.body)).not.toContain('beta-secret-task');

    const asOwnerB = await request(server()).get('/tasks').set(auth(tokenB));
    expect(asOwnerB.status).toBe(200);
    expect(asOwnerB.body.map((task: { title: string }) => task.title)).toEqual([
      'beta-secret-task',
    ]);
  });

  it('lists noteCount and taskCount in one query and returns 409 when the tag is in use', async () => {
    const before = countQueries();
    const listed = await request(server()).get('/tags').set(auth(tokenA));
    expect(listed.status).toBe(200);
    expect(countQueries() - before).toBe(2);
    expect(listed.body.map((tag: { name: string }) => tag.name)).toEqual([
      'home',
      'later',
      'work',
    ]);
    const byName = Object.fromEntries(
      listed.body.map(
        (tag: { name: string; noteCount: number; taskCount: number }) => [
          tag.name,
          tag,
        ],
      ),
    );
    expect(byName.work).toEqual(
      expect.objectContaining({
        id: TAG_WORK_ID,
        name: 'work',
        color: 'cyan',
        noteCount: 1,
        taskCount: 3,
      }),
    );
    expect(byName.home).toEqual(
      expect.objectContaining({ noteCount: 0, taskCount: 1 }),
    );
    expect(byName.later).toEqual(
      expect.objectContaining({ noteCount: 0, taskCount: 0 }),
    );
    expect(typeof byName.work.noteCount).toBe('number');
    expect(typeof byName.work.taskCount).toBe('number');
    expect(JSON.stringify(listed.body)).not.toContain('beta-secret-tag');
    expect(JSON.stringify(listed.body)).not.toContain(PASSWORD_A);

    const single = await request(server())
      .get(`/tags/${TAG_WORK_ID}`)
      .set(auth(tokenA));
    expect(single.status).toBe(200);
    expect(single.body.noteCount).toBeUndefined();
    expect(single.body.taskCount).toBeUndefined();

    const blockedByNote = await request(server())
      .delete(`/tags/${TAG_WORK_ID}`)
      .set(auth(tokenA));
    expect(blockedByNote.status).toBe(409);
    expect(blockedByNote.body).toEqual({
      statusCode: 409,
      message:
        'This tag is still in use. Remove it from your notes and tasks before deleting it.',
      error: 'Conflict',
    });

    const blockedByTask = await request(server())
      .delete(`/tags/${TAG_HOME_ID}`)
      .set(auth(tokenA));
    expect(blockedByTask.status).toBe(409);
    expect(blockedByTask.body.message).toBe(
      'This tag is still in use. Remove it from your notes and tasks before deleting it.',
    );

    const stillThere = await request(server())
      .get(`/tags/${TAG_WORK_ID}`)
      .set(auth(tokenA));
    expect(stillThere.status).toBe(200);

    const foreign = await request(server())
      .delete(`/tags/${TAG_SECRET_ID}`)
      .set(auth(tokenA));
    expect(foreign.status).toBe(404);
    expect(foreign.body.message).toBe('Tag not found or not owned by user');

    await request(server())
      .patch(`/tasks/${TASK_ALPHA_ID}`)
      .set(auth(tokenA))
      .send({ tagIds: [TAG_WORK_ID] });
    const homeGone = await request(server())
      .delete(`/tags/${TAG_HOME_ID}`)
      .set(auth(tokenA));
    expect(homeGone.status).toBe(200);

    const workStillUsedByNote = await request(server())
      .delete(`/tags/${TAG_WORK_ID}`)
      .set(auth(tokenA));
    expect(workStillUsedByNote.status).toBe(409);

    const removed = await request(server())
      .delete(`/tags/${TAG_FREE_ID}`)
      .set(auth(tokenA));
    expect(removed.status).toBe(200);
    const after = await request(server()).get('/tags').set(auth(tokenA));
    expect(
      after.body.some((tag: { id: number }) => tag.id === TAG_FREE_ID),
    ).toBe(false);
  });
});

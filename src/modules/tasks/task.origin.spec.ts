import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AuthRateLimiter } from '../auth/rate-limit';
import { AuthToken } from '../auth/tokens/auth-token.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { TagsService } from '../tags/tags.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { Task } from './tasks.entity';
import { TaskController } from './tasks.controller';
import { TaskService } from './tasks.service';

/* The in-memory repositories and supertest responses are intentionally loose.
   The assertions below are the origin-note contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-task-origin-secret';

const USER_A_ID = 101;
const USER_B_ID = 202;
const NOTE_A_ID = 1001;
const NOTE_B_ID = 2002;
const TITLE_A = 'note-secret-alpha-title';
const TITLE_B = 'note-secret-beta-title';
const BODY_A = '<p>alpha private task-origin body</p>';
const BODY_B = '<p>beta private task-origin body</p>';

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
  sessionVersion: number;
};

type StoredNote = {
  id: number;
  title: string;
  content: string;
  userId: number;
};

type StoredTask = {
  id: number;
  userId: number;
  title: string;
  description?: string;
  isComplete: boolean;
  isArchived: boolean;
  priority: number;
  originNoteId: number | null;
  tags: unknown[];
  createdAt: Date;
  updatedAt: Date;
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

function createMemory() {
  const users: StoredUser[] = [
    {
      id: USER_A_ID,
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
      password: 'synthetic-password-hash-a',
      sessionVersion: 0,
    },
    {
      id: USER_B_ID,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: 'synthetic-password-hash-b',
      sessionVersion: 0,
    },
  ];

  const notes: StoredNote[] = [
    {
      id: NOTE_A_ID,
      title: TITLE_A,
      content: BODY_A,
      userId: USER_A_ID,
    },
    {
      id: NOTE_B_ID,
      title: TITLE_B,
      content: BODY_B,
      userId: USER_B_ID,
    },
  ];

  const tasks: StoredTask[] = [];
  let taskSeq = 5000;

  function copyTask(task: StoredTask): StoredTask {
    return { ...task, tags: task.tags.map((tag) => ({ ...(tag as object) })) };
  }

  const noteRepo = {
    async find(options?: {
      where?: { id?: unknown; userId?: unknown };
    }): Promise<StoredNote[]> {
      const where = options?.where ?? {};
      const ids = idList(where.id);
      const userId = 'userId' in where ? asNumber(where.userId) : undefined;
      return notes
        .filter((note) => (ids ? ids.includes(note.id) : true))
        .filter((note) => userId === undefined || note.userId === userId)
        .map((note) => ({ ...note }));
    },
  };

  const taskRepo = {
    create(
      partial: Partial<StoredTask> & { user?: { id: number } },
    ): StoredTask {
      return {
        id: partial.id ?? 0,
        userId: partial.userId || partial.user?.id || 0,
        title: partial.title ?? '',
        description: partial.description,
        isComplete: partial.isComplete ?? false,
        isArchived: partial.isArchived ?? false,
        priority: partial.priority ?? 2,
        originNoteId: partial.originNoteId ?? null,
        tags: partial.tags ?? [],
        createdAt: partial.createdAt ?? new Date(),
        updatedAt: partial.updatedAt ?? new Date(),
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
    }): Promise<StoredTask | null> {
      const id = asNumber(options?.where?.id);
      const found = tasks.find((row) => row.id === id);
      return found ? copyTask(found) : null;
    },
    createQueryBuilder() {
      const state: { userId?: number; archived?: boolean } = {};
      const qb = {
        leftJoinAndSelect: () => qb,
        where: (_sql: string, params?: { userId?: unknown }) => {
          if (params && 'userId' in params)
            state.userId = asNumber(params.userId);
          return qb;
        },
        andWhere: (_sql: string, params?: { archived?: unknown }) => {
          if (params && 'archived' in params) {
            state.archived = Boolean(params.archived);
          }
          return qb;
        },
        innerJoin: () => qb,
        orderBy: () => qb,
        take: () => qb,
        skip: () => qb,
        getMany: async () => {
          return tasks
            .filter(
              (row) =>
                state.userId === undefined || row.userId === state.userId,
            )
            .filter(
              (row) =>
                state.archived === undefined ||
                row.isArchived === state.archived,
            )
            .map((row) => copyTask(row));
        },
      };
      return qb;
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
      return userRepo.findOne({ where });
    },
  };

  return { noteRepo, taskRepo, userRepo, notes };
}

describe('Task origin note (controller + service)', () => {
  let app: INestApplication;
  let memory: ReturnType<typeof createMemory>;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    memory = createMemory();
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
      controllers: [TaskController],
      providers: [
        TaskService,
        TagsService,
        UserService,
        AuthRateLimiter,
        JwtStrategy,
        { provide: getRepositoryToken(Task), useValue: memory.taskRepo },
        { provide: getRepositoryToken(Note), useValue: memory.noteRepo },
        {
          provide: getRepositoryToken(Tag),
          useValue: { find: async () => [] },
        },
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

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('stores an owned origin note and returns only its id and title', async () => {
    const created = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'from-alpha', originNoteId: NOTE_A_ID });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('from-alpha');
    expect(created.body.userId).toBe(USER_A_ID);
    expect(created.body.user).toBeUndefined();
    expect(created.body.originNoteId).toBe(NOTE_A_ID);
    expect(created.body.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(Object.keys(created.body.originNote).sort()).toEqual([
      'id',
      'title',
    ]);
    expect(JSON.stringify(created.body)).not.toContain(BODY_A);
    expect(JSON.stringify(created.body)).not.toContain(TITLE_B);
    expect(JSON.stringify(created.body)).not.toContain(BODY_B);
    const taskId = created.body.id as number;

    const one = await request(server())
      .get(`/tasks/${taskId}`)
      .set(auth(tokenA));
    expect(one.status).toBe(200);
    expect(one.body.originNoteId).toBe(NOTE_A_ID);
    expect(one.body.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(JSON.stringify(one.body)).not.toContain(BODY_A);

    const listed = await request(server()).get('/tasks').set(auth(tokenA));
    expect(listed.status).toBe(200);
    const row = listed.body.find((task: { id: number }) => task.id === taskId);
    expect(row.originNoteId).toBe(NOTE_A_ID);
    expect(row.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(JSON.stringify(listed.body)).not.toContain(BODY_A);
    expect(JSON.stringify(listed.body)).not.toContain(TITLE_B);

    const plain = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'no-source' });
    expect(plain.status).toBe(201);
    expect(plain.body.originNoteId).toBeNull();
    expect(plain.body.originNote).toBeNull();

    const explicitNull = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'null-source', originNoteId: null });
    expect(explicitNull.status).toBe(201);
    expect(explicitNull.body.originNoteId).toBeNull();
    expect(explicitNull.body.originNote).toBeNull();

    const asOther = await request(server())
      .get(`/tasks/${taskId}`)
      .set(auth(tokenB));
    expect(asOther.status).toBe(403);
    expect(JSON.stringify(asOther.body)).not.toContain(TITLE_A);
    expect(JSON.stringify(asOther.body)).not.toContain(BODY_A);
  });

  it("rejects a missing origin note and someone else's note the same way", async () => {
    const missing = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'missing-source', originNoteId: 999999 });
    const foreign = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'foreign-source', originNoteId: NOTE_B_ID });

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body).toEqual({
      statusCode: 404,
      message: 'Note not found',
      error: 'Not Found',
    });
    expect(JSON.stringify(foreign.body)).not.toContain(TITLE_B);
    expect(JSON.stringify(foreign.body)).not.toContain(BODY_B);

    const listed = await request(server()).get('/tasks').set(auth(tokenA));
    const titles = listed.body.map((task: { title: string }) => task.title);
    expect(titles).not.toContain('missing-source');
    expect(titles).not.toContain('foreign-source');
  });

  it('does not change originNoteId from the update endpoint', async () => {
    const created = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'keep-origin', originNoteId: NOTE_A_ID });
    expect(created.status).toBe(201);
    const taskId = created.body.id as number;

    const renamed = await request(server())
      .patch(`/tasks/${taskId}`)
      .set(auth(tokenA))
      .send({ title: 'renamed-origin' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.title).toBe('renamed-origin');
    expect(renamed.body.originNoteId).toBe(NOTE_A_ID);
    expect(renamed.body.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });

    const rejected = await request(server())
      .patch(`/tasks/${taskId}`)
      .set(auth(tokenA))
      .send({ originNoteId: NOTE_B_ID });
    expect(rejected.status).toBe(400);

    const read = await request(server())
      .get(`/tasks/${taskId}`)
      .set(auth(tokenA));
    expect(read.status).toBe(200);
    expect(read.body.title).toBe('renamed-origin');
    expect(read.body.originNoteId).toBe(NOTE_A_ID);
    expect(read.body.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(JSON.stringify(read.body)).not.toContain(BODY_A);
    expect(JSON.stringify(read.body)).not.toContain(TITLE_B);
  });

  it('omits the origin summary once the source note is gone', async () => {
    const created = await request(server())
      .post('/tasks')
      .set(auth(tokenA))
      .send({ title: 'dangling-source', originNoteId: NOTE_A_ID });
    expect(created.status).toBe(201);
    const taskId = created.body.id as number;

    const index = memory.notes.findIndex((note) => note.id === NOTE_A_ID);
    const [removed] = memory.notes.splice(index, 1);
    try {
      const one = await request(server())
        .get(`/tasks/${taskId}`)
        .set(auth(tokenA));
      expect(one.status).toBe(200);
      expect(one.body.originNoteId).toBe(NOTE_A_ID);
      expect(one.body.originNote).toBeNull();
      expect(JSON.stringify(one.body)).not.toContain(TITLE_A);
      expect(JSON.stringify(one.body)).not.toContain(BODY_A);
    } finally {
      memory.notes.push(removed);
    }
  });
});

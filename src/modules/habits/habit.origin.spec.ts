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
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { HabitCheck } from './habit-check.entity';
import { HabitController } from './habit.controller';
import { Habit } from './habit.entity';
import { HabitService } from './habit.service';

/* The in-memory repositories and supertest responses are intentionally loose.
   The assertions below are the origin-note contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-habit-origin-secret';

const USER_A_ID = 101;
const USER_B_ID = 202;
const NOTE_A_ID = 1001;
const NOTE_B_ID = 2002;
const TITLE_A = 'note-secret-alpha-title';
const TITLE_B = 'note-secret-beta-title';
const BODY_A = '<p>alpha private body</p>';
const BODY_B = '<p>beta private body</p>';

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
};

type StoredNote = {
  id: number;
  title: string;
  content: string;
  userId: number;
};

type StoredHabit = {
  id: number;
  name: string;
  description?: string;
  intent?: string;
  affirmation?: string;
  color: string;
  icon?: string;
  frequency: string;
  isActive: boolean;
  userId: number;
  originNoteId: number | null;
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
    },
    {
      id: USER_B_ID,
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: 'synthetic-password-hash-b',
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

  const habits: StoredHabit[] = [];
  let habitSeq = 4000;

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
    async findOne(options?: {
      where?: { id?: unknown; userId?: unknown };
    }): Promise<StoredNote | null> {
      const rows = await noteRepo.find(options);
      return rows[0] ?? null;
    },
  };

  const habitRepo = {
    create(partial: Partial<StoredHabit>): StoredHabit {
      return {
        id: 0,
        name: partial.name ?? '',
        description: partial.description,
        intent: partial.intent,
        affirmation: partial.affirmation,
        color: partial.color ?? 'cyan',
        icon: partial.icon,
        frequency: partial.frequency ?? 'daily',
        isActive: partial.isActive ?? true,
        userId: partial.userId ?? 0,
        originNoteId: partial.originNoteId ?? null,
        createdAt: partial.createdAt ?? new Date(),
        updatedAt: partial.updatedAt ?? new Date(),
      };
    },
    async save(habit: StoredHabit): Promise<StoredHabit> {
      if (!habit.id) habit.id = ++habitSeq;
      const existing = habits.find((row) => row.id === habit.id);
      if (existing) {
        Object.assign(existing, habit);
        return existing;
      }
      habits.push(habit);
      return habit;
    },
    async find(options?: {
      where?: { id?: unknown; userId?: unknown; isActive?: boolean };
      order?: { createdAt?: 'ASC' | 'DESC' };
    }): Promise<StoredHabit[]> {
      const where = options?.where ?? {};
      const userId = 'userId' in where ? asNumber(where.userId) : undefined;
      let rows = habits.filter((habit) => {
        if (userId !== undefined && habit.userId !== userId) return false;
        if (where.isActive !== undefined && habit.isActive !== where.isActive) {
          return false;
        }
        return true;
      });
      if (options?.order?.createdAt === 'DESC') {
        rows = [...rows].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }
      return rows.map((habit) => ({ ...habit }));
    },
    async findOne(options?: {
      where?: { id?: unknown; userId?: unknown };
    }): Promise<StoredHabit | null> {
      const where = options?.where ?? {};
      const id = asNumber(where.id);
      const userId = 'userId' in where ? asNumber(where.userId) : undefined;
      const found = habits.find(
        (habit) =>
          habit.id === id && (userId === undefined || habit.userId === userId),
      );
      return found ? { ...found } : null;
    },
  };

  const checkRepo = {
    async find(): Promise<{ habitId: number; date: string }[]> {
      return [];
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
  };

  return { noteRepo, habitRepo, checkRepo, userRepo, notes, habits };
}

describe('Habit origin note (controller + service)', () => {
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
      controllers: [HabitController],
      providers: [
        HabitService,
        UserService,
        AuthRateLimiter,
        JwtStrategy,
        { provide: getRepositoryToken(Habit), useValue: memory.habitRepo },
        {
          provide: getRepositoryToken(HabitCheck),
          useValue: memory.checkRepo,
        },
        { provide: getRepositoryToken(Note), useValue: memory.noteRepo },
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
      .post('/habits')
      .set(auth(tokenA))
      .send({ name: 'from-alpha', originNoteId: NOTE_A_ID });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('from-alpha');
    expect(created.body.userId).toBe(USER_A_ID);
    expect(created.body.originNoteId).toBe(NOTE_A_ID);
    expect(created.body.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(JSON.stringify(created.body)).not.toContain(BODY_A);
    expect(JSON.stringify(created.body)).not.toContain(TITLE_B);
    const habitId = created.body.id;

    const one = await request(server())
      .get(`/habits/${habitId}`)
      .set(auth(tokenA));
    expect(one.status).toBe(200);
    expect(one.body.originNoteId).toBe(NOTE_A_ID);
    expect(one.body.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(one.body.checkedToday).toBe(false);
    expect(one.body.currentStreak).toBe(0);
    expect(JSON.stringify(one.body)).not.toContain(BODY_A);

    const listed = await request(server()).get('/habits').set(auth(tokenA));
    expect(listed.status).toBe(200);
    const row = listed.body.find(
      (habit: { id: number }) => habit.id === habitId,
    );
    expect(row.originNoteId).toBe(NOTE_A_ID);
    expect(row.originNote).toEqual({ id: NOTE_A_ID, title: TITLE_A });
    expect(JSON.stringify(listed.body)).not.toContain(BODY_A);
    expect(JSON.stringify(listed.body)).not.toContain(TITLE_B);

    const plain = await request(server())
      .post('/habits')
      .set(auth(tokenA))
      .send({ name: 'no-source' });
    expect(plain.status).toBe(201);
    expect(plain.body.originNoteId).toBeNull();
    expect(plain.body.originNote).toBeNull();

    const asOther = await request(server())
      .get(`/habits/${habitId}`)
      .set(auth(tokenB));
    expect(asOther.status).toBe(404);
    expect(JSON.stringify(asOther.body)).not.toContain(TITLE_A);
    expect(JSON.stringify(asOther.body)).not.toContain(BODY_A);
  });

  it("rejects a missing origin note and someone else's note the same way", async () => {
    const missing = await request(server())
      .post('/habits')
      .set(auth(tokenA))
      .send({ name: 'missing-source', originNoteId: 999999 });
    const foreign = await request(server())
      .post('/habits')
      .set(auth(tokenA))
      .send({ name: 'foreign-source', originNoteId: NOTE_B_ID });

    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.message).toBe('Note not found');
    expect(JSON.stringify(foreign.body)).not.toContain(TITLE_B);
    expect(JSON.stringify(foreign.body)).not.toContain(BODY_B);

    const listed = await request(server()).get('/habits').set(auth(tokenA));
    const names = listed.body.map((habit: { name: string }) => habit.name);
    expect(names).not.toContain('missing-source');
    expect(names).not.toContain('foreign-source');
  });

  it('omits the origin summary once the source note is gone', async () => {
    const created = await request(server())
      .post('/habits')
      .set(auth(tokenA))
      .send({ name: 'dangling-source', originNoteId: NOTE_A_ID });
    expect(created.status).toBe(201);
    const habitId = created.body.id;

    const index = memory.notes.findIndex((note) => note.id === NOTE_A_ID);
    const [removed] = memory.notes.splice(index, 1);

    const one = await request(server())
      .get(`/habits/${habitId}`)
      .set(auth(tokenA));
    expect(one.status).toBe(200);
    expect(one.body.originNoteId).toBe(NOTE_A_ID);
    expect(one.body.originNote).toBeNull();
    expect(JSON.stringify(one.body)).not.toContain(TITLE_A);
    expect(JSON.stringify(one.body)).not.toContain(BODY_A);

    memory.notes.push(removed);
  });
});

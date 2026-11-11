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
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { Mood } from '../moods/mood.entity';
import { Note } from '../notes/notes.entity';
import { Task } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { CalendarController } from './calendar.controller';
import { CalendarEvent } from './calendar-event.entity';
import { CalendarService } from './calendar.service';

/* The in-memory repositories and supertest responses are intentionally loose.
   The assertions below are the link-ownership contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-calendar-link-secret';

const USER_A_ID = 101;
const USER_B_ID = 202;

const NOTE_A_ID = 1001;
const NOTE_B_ID = 2002;
const NOTE_TITLE_B = 'note-secret-beta-title';

const TASK_A_ID = 301;
const TASK_B_ID = 302;
const TASK_TITLE_B = 'task-secret-beta-title';

const HABIT_A_ID = 401;
const HABIT_B_ID = 402;
const HABIT_NAME_B = 'habit-secret-beta-name';

type OwnedRow = { id: number; userId: number; title: string };

type StoredEvent = {
  id: number;
  userId: number;
  title: string;
  allDay: boolean;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  color: string;
  recurrence: string;
  linkedType?: string | null;
  linkedId?: number | null;
  description?: string | null;
  location?: string | null;
  recurrenceEndDate?: string | null;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function ownedRepo(rows: OwnedRow[]) {
  return {
    async findOne(options?: {
      where?: { id?: unknown; userId?: unknown };
    }): Promise<OwnedRow | null> {
      const where = options?.where ?? {};
      const id = asNumber(where.id);
      const userId = 'userId' in where ? asNumber(where.userId) : undefined;
      const found = rows.find(
        (row) =>
          row.id === id && (userId === undefined || row.userId === userId),
      );
      return found ? { ...found } : null;
    },
    async find(): Promise<OwnedRow[]> {
      return [];
    },
  };
}

function createMemory() {
  const notes: OwnedRow[] = [
    { id: NOTE_A_ID, userId: USER_A_ID, title: 'note-secret-alpha-title' },
    { id: NOTE_B_ID, userId: USER_B_ID, title: NOTE_TITLE_B },
  ];
  const tasks: OwnedRow[] = [
    { id: TASK_A_ID, userId: USER_A_ID, title: 'task-secret-alpha-title' },
    { id: TASK_B_ID, userId: USER_B_ID, title: TASK_TITLE_B },
  ];
  const habits: OwnedRow[] = [
    { id: HABIT_A_ID, userId: USER_A_ID, title: 'habit-secret-alpha-name' },
    { id: HABIT_B_ID, userId: USER_B_ID, title: HABIT_NAME_B },
  ];
  const events: StoredEvent[] = [];
  let eventSeq = 5000;

  const users = [
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

  const eventRepo = {
    create(partial: Partial<StoredEvent>): StoredEvent {
      return {
        id: 0,
        userId: 0,
        title: '',
        allDay: true,
        startDate: '',
        color: 'cyan',
        recurrence: 'none',
        linkedType: null,
        linkedId: null,
        ...partial,
      };
    },
    merge(event: StoredEvent, partial: Partial<StoredEvent>): StoredEvent {
      Object.assign(event, partial);
      return event;
    },
    async save(event: StoredEvent): Promise<StoredEvent> {
      if (!event.id) event.id = ++eventSeq;
      const existing = events.find((row) => row.id === event.id);
      if (existing) {
        Object.assign(existing, event);
        return existing;
      }
      events.push(event);
      return event;
    },
    async findOne(options?: {
      where?: { id?: unknown };
    }): Promise<StoredEvent | null> {
      const id = asNumber(options?.where?.id);
      const found = events.find((event) => event.id === id);
      return found ? { ...found } : null;
    },
    createQueryBuilder() {
      const qb = {
        where: () => qb,
        andWhere: () => qb,
        getMany: async () => [],
      };
      return qb;
    },
  };

  const userRepo = {
    async findOne(options?: { where?: { id?: unknown } }) {
      const id = asNumber(options?.where?.id);
      const found = users.find((user) => user.id === id);
      return found ? { ...found } : null;
    },
  };

  return {
    eventRepo,
    noteRepo: ownedRepo(notes),
    taskRepo: ownedRepo(tasks),
    habitRepo: ownedRepo(habits),
    userRepo,
  };
}

describe('Calendar link ownership (controller + service)', () => {
  let app: INestApplication;
  let tokenA: string;

  beforeAll(async () => {
    const memory = createMemory();
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
      controllers: [CalendarController],
      providers: [
        CalendarService,
        UserService,
        AuthRateLimiter,
        JwtStrategy,
        {
          provide: getRepositoryToken(CalendarEvent),
          useValue: memory.eventRepo,
        },
        { provide: getRepositoryToken(Task), useValue: memory.taskRepo },
        { provide: getRepositoryToken(Habit), useValue: memory.habitRepo },
        {
          provide: getRepositoryToken(HabitCheck),
          useValue: { find: async () => [] },
        },
        {
          provide: getRepositoryToken(Mood),
          useValue: { find: async () => [] },
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
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();

  function auth() {
    return { Authorization: `Bearer ${tokenA}` };
  }

  async function createLinked(linkedType: string, linkedId: number) {
    return request(server())
      .post('/calendar/events')
      .set(auth())
      .send({
        title: `link-${linkedType}`,
        startDate: '2026-05-01',
        allDay: true,
        linkedType,
        linkedId,
      });
  }

  it("stores a link to the caller's own note, task, or habit", async () => {
    const note = await createLinked('note', NOTE_A_ID);
    expect(note.status).toBe(201);
    expect(note.body.userId).toBe(USER_A_ID);
    expect(note.body.linkedType).toBe('note');
    expect(note.body.linkedId).toBe(NOTE_A_ID);

    const task = await createLinked('task', TASK_A_ID);
    expect(task.status).toBe(201);
    expect(task.body.linkedType).toBe('task');
    expect(task.body.linkedId).toBe(TASK_A_ID);

    const habit = await createLinked('habit', HABIT_A_ID);
    expect(habit.status).toBe(201);
    expect(habit.body.linkedType).toBe('habit');
    expect(habit.body.linkedId).toBe(HABIT_A_ID);

    const plain = await request(server())
      .post('/calendar/events')
      .set(auth())
      .send({ title: 'no-link', startDate: '2026-05-02', allDay: true });
    expect(plain.status).toBe(201);
    expect(plain.body.linkedType ?? null).toBeNull();
    expect(plain.body.linkedId ?? null).toBeNull();
  });

  it("rejects a missing link target and someone else's target the same way", async () => {
    const cases: Array<[string, number, string]> = [
      ['note', NOTE_B_ID, NOTE_TITLE_B],
      ['task', TASK_B_ID, TASK_TITLE_B],
      ['habit', HABIT_B_ID, HABIT_NAME_B],
    ];

    for (const [linkedType, foreignId, secret] of cases) {
      const missing = await createLinked(linkedType, 999999);
      const foreign = await createLinked(linkedType, foreignId);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect(foreign.body.message).toBe('Linked item not found');
      expect(JSON.stringify(foreign.body)).not.toContain(secret);
    }
  });

  it("does not retarget an event at someone else's note", async () => {
    const created = await createLinked('note', NOTE_A_ID);
    expect(created.status).toBe(201);
    const id = created.body.id;

    const retarget = await request(server())
      .patch(`/calendar/events/${id}`)
      .set(auth())
      .send({ linkedType: 'task', linkedId: TASK_B_ID });
    expect(retarget.status).toBe(404);
    expect(retarget.body.message).toBe('Linked item not found');
    expect(JSON.stringify(retarget.body)).not.toContain(TASK_TITLE_B);

    const still = await request(server())
      .get(`/calendar/events/${id}`)
      .set(auth());
    expect(still.status).toBe(200);
    expect(still.body.linkedType).toBe('note');
    expect(still.body.linkedId).toBe(NOTE_A_ID);

    const moved = await request(server())
      .patch(`/calendar/events/${id}`)
      .set(auth())
      .send({ linkedType: 'habit', linkedId: HABIT_A_ID });
    expect(moved.status).toBe(200);
    expect(moved.body.linkedType).toBe('habit');
    expect(moved.body.linkedId).toBe(HABIT_A_ID);

    const cleared = await request(server())
      .patch(`/calendar/events/${id}`)
      .set(auth())
      .send({ linkedType: null, linkedId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.linkedType).toBeNull();
    expect(cleared.body.linkedId).toBeNull();
  });
});

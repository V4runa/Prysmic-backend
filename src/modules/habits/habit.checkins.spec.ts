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
import { userQueryBuilder } from '../../testing/user-query';
import { HabitCheck } from './habit-check.entity';
import { HabitController } from './habit.controller';
import { Habit } from './habit.entity';
import { HabitService } from './habit.service';

/* The in-memory repositories and supertest responses are intentionally loose.
   The assertions below are the check-in range contract. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-habit-checkins-secret';

const USER_A_ID = 101;
const USER_B_ID = 202;

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
};

type StoredHabit = {
  id: number;
  name: string;
  color: string;
  frequency: string;
  isActive: boolean;
  userId: number;
  originNoteId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredCheck = {
  id: number;
  habitId: number;
  date: string;
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

function operatorValue(
  value: unknown,
): { type: string; value: unknown } | null {
  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  ) {
    return value as { type: string; value: unknown };
  }
  return null;
}

function dateMatches(stored: string, criterion: unknown): boolean {
  if (criterion === undefined) return true;
  if (typeof criterion === 'string') return stored === criterion;
  const operator = operatorValue(criterion);
  if (!operator) return false;
  if (operator.type === 'between' && Array.isArray(operator.value)) {
    const [start, end] = operator.value as [string, string];
    return stored >= start && stored <= end;
  }
  if (
    operator.type === 'moreThanOrEqual' &&
    typeof operator.value === 'string'
  ) {
    return stored >= operator.value;
  }
  return false;
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

  const habits: StoredHabit[] = [];
  const checks: StoredCheck[] = [];
  let habitSeq = 4000;
  let checkSeq = 8000;

  const habitRepo = {
    create(partial: Partial<StoredHabit>): StoredHabit {
      return {
        id: 0,
        name: partial.name ?? '',
        color: partial.color ?? 'cyan',
        frequency: partial.frequency ?? 'daily',
        isActive: partial.isActive ?? true,
        userId: partial.userId ?? 0,
        originNoteId: partial.originNoteId ?? null,
        createdAt: partial.createdAt ?? new Date('2024-03-15T12:00:00.000Z'),
        updatedAt: partial.updatedAt ?? new Date('2024-03-15T12:00:00.000Z'),
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
      where?: { userId?: unknown; isActive?: boolean };
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
    create(partial: Partial<StoredCheck>): StoredCheck {
      return {
        id: 0,
        habitId: partial.habitId ?? 0,
        date: partial.date ?? '',
      };
    },
    async save(check: StoredCheck): Promise<StoredCheck> {
      const existing = checks.find(
        (row) => row.habitId === check.habitId && row.date === check.date,
      );
      if (existing) return existing;
      if (!check.id) check.id = ++checkSeq;
      checks.push(check);
      return check;
    },
    async remove(check: StoredCheck): Promise<StoredCheck> {
      const index = checks.findIndex(
        (row) => row.habitId === check.habitId && row.date === check.date,
      );
      if (index >= 0) checks.splice(index, 1);
      return check;
    },
    async find(options?: {
      where?: { habitId?: unknown; date?: unknown };
    }): Promise<StoredCheck[]> {
      const where = options?.where ?? {};
      const habitIds = idList(where.habitId);
      return checks
        .filter((check) => (habitIds ? habitIds.includes(check.habitId) : true))
        .filter((check) => dateMatches(check.date, where.date))
        .map((check) => ({ ...check }));
    },
    async findOne(options?: {
      where?: { habitId?: unknown; date?: unknown };
    }): Promise<StoredCheck | null> {
      const rows = await checkRepo.find(options);
      return rows[0] ?? null;
    },
  };

  const noteRepo = {
    async find(): Promise<never[]> {
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
    createQueryBuilder() {
      return userQueryBuilder(users);
    },
  };

  return { habitRepo, checkRepo, noteRepo, userRepo };
}

describe('GET /habits/:id/checkins', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

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

  async function createHabit(
    token: string,
    body: { name: string; frequency?: string },
  ): Promise<number> {
    const created = await request(server())
      .post('/habits')
      .set(auth(token))
      .send(body);
    expect(created.status).toBe(201);
    return created.body.id as number;
  }

  async function check(token: string, habitId: number, date: string) {
    const response = await request(server())
      .post(`/habits/${habitId}/check`)
      .set(auth(token))
      .send({ date });
    expect(response.status).toBe(201);
  }

  function readCheckins(
    token: string,
    habitId: number | string,
    query: { from?: string; to?: string },
  ) {
    return request(server())
      .get(`/habits/${habitId}/checkins`)
      .query(query)
      .set(auth(token));
  }

  it('returns the owner the kept days inside the range, sorted', async () => {
    const habitId = await createHabit(tokenA, { name: 'morning-pages' });
    await check(tokenA, habitId, '2026-07-20');
    await check(tokenA, habitId, '2026-07-02');
    await check(tokenA, habitId, '2026-07-11');
    await check(tokenA, habitId, '2026-08-01');

    const response = await readCheckins(tokenA, habitId, {
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['dates', 'from', 'to']);
    expect(response.body).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      dates: ['2026-07-02', '2026-07-11', '2026-07-20'],
    });

    const one = await request(server())
      .get(`/habits/${habitId}`)
      .set(auth(tokenA));
    expect(one.status).toBe(200);
    expect(one.body.createdAt).toEqual(expect.any(String));
    expect(one.body.currentStreak).toEqual(expect.any(Number));
    expect(one.body.longestStreak).toEqual(expect.any(Number));
    expect(one.body.checkedToday).toEqual(expect.any(Boolean));
    expect(one.body).not.toHaveProperty('dates');
  });

  it('reads checks older than the streak window', async () => {
    const habitId = await createHabit(tokenA, { name: 'old-promise' });
    await check(tokenA, habitId, '2015-06-15');

    const historic = await readCheckins(tokenA, habitId, {
      from: '2015-06-01',
      to: '2015-06-30',
    });
    expect(historic.status).toBe(200);
    expect(historic.body.dates).toEqual(['2015-06-15']);

    const recent = await readCheckins(tokenA, habitId, {
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(recent.status).toBe(200);
    expect(recent.body.dates).toEqual([]);
  });

  it('returns the actual checked day for weekly and monthly habits', async () => {
    const weeklyId = await createHabit(tokenA, {
      name: 'weekly-review',
      frequency: 'weekly',
    });
    await check(tokenA, weeklyId, '2026-05-03');
    await check(tokenA, weeklyId, '2026-05-20');

    const weekly = await readCheckins(tokenA, weeklyId, {
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(weekly.status).toBe(200);
    expect(weekly.body.dates).toEqual(['2026-05-03', '2026-05-20']);

    const monthlyId = await createHabit(tokenA, {
      name: 'monthly-letter',
      frequency: 'monthly',
    });
    await check(tokenA, monthlyId, '2026-08-19');

    const monthly = await readCheckins(tokenA, monthlyId, {
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(monthly.status).toBe(200);
    expect(monthly.body.dates).toEqual(['2026-08-19']);
  });

  it('includes both endpoints of the range and drops the days outside it', async () => {
    const habitId = await createHabit(tokenA, { name: 'boundaries' });
    for (const date of [
      '2026-04-01',
      '2026-04-02',
      '2026-04-15',
      '2026-04-30',
      '2026-05-01',
    ]) {
      await check(tokenA, habitId, date);
    }

    const inside = await readCheckins(tokenA, habitId, {
      from: '2026-04-02',
      to: '2026-04-30',
    });
    expect(inside.status).toBe(200);
    expect(inside.body).toEqual({
      from: '2026-04-02',
      to: '2026-04-30',
      dates: ['2026-04-02', '2026-04-15', '2026-04-30'],
    });

    const single = await readCheckins(tokenA, habitId, {
      from: '2026-04-15',
      to: '2026-04-15',
    });
    expect(single.status).toBe(200);
    expect(single.body.dates).toEqual(['2026-04-15']);

    const leap = await readCheckins(tokenA, habitId, {
      from: '2024-02-29',
      to: '2024-02-29',
    });
    expect(leap.status).toBe(200);
    expect(leap.body.dates).toEqual([]);

    const maxSpan = await readCheckins(tokenA, habitId, {
      from: '2026-01-01',
      to: '2026-03-03',
    });
    expect(maxSpan.status).toBe(200);
    expect(maxSpan.body.dates).toEqual([]);

    await check(tokenA, habitId, '2026-09-09');
    await check(tokenA, habitId, '2026-09-09');
    const undone = await readCheckins(tokenA, habitId, {
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(undone.status).toBe(200);
    expect(undone.body.dates).toEqual([]);
  });

  it('gives another user the same 404 as a missing habit', async () => {
    const habitId = await createHabit(tokenA, { name: 'private-contract' });
    await check(tokenA, habitId, '2026-10-10');
    const otherId = await createHabit(tokenB, { name: 'other-contract' });
    await check(tokenB, otherId, '2026-10-10');

    const missing = await readCheckins(tokenB, 999999, {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    const foreign = await readCheckins(tokenB, habitId, {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body).toEqual({
      statusCode: 404,
      message: 'Habit not found or you do not have access.',
      error: 'Not Found',
    });
    expect(JSON.stringify(foreign.body)).not.toContain('private-contract');
    expect(JSON.stringify(foreign.body)).not.toContain('2026-10-10');

    const own = await readCheckins(tokenB, otherId, {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(own.status).toBe(200);
    expect(own.body.dates).toEqual(['2026-10-10']);
  });

  it('answers a malformed habit id with the same 404 as other broken links', async () => {
    for (const id of ['xyz', 'all', '1.5', '2147483648']) {
      const response = await readCheckins(tokenA, id, {
        from: '2026-01-01',
        to: '2026-01-31',
      });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        statusCode: 404,
        message: 'Not found',
        error: 'Not Found',
      });
    }
  });

  it('rejects a missing, invalid, reversed, or too-long range', async () => {
    const habitId = await createHabit(tokenA, { name: 'range-guard' });

    const missingFrom = await readCheckins(tokenA, habitId, {
      to: '2026-01-31',
    });
    const missingTo = await readCheckins(tokenA, habitId, {
      from: '2026-01-01',
    });
    const missingBoth = await readCheckins(tokenA, habitId, {});
    for (const response of [missingFrom, missingTo, missingBoth]) {
      expect(response.status).toBe(400);
    }
    expect(JSON.stringify(missingFrom.body.message)).toContain('from');
    expect(JSON.stringify(missingTo.body.message)).toContain('to');

    const format = await readCheckins(tokenA, habitId, {
      from: 'nope',
      to: '2026-01-31',
    });
    expect(format.status).toBe(400);
    expect(JSON.stringify(format.body.message)).toContain(
      'from must be YYYY-MM-DD',
    );

    const impossible = [
      { from: '2026-02-31', to: '2026-03-01' },
      { from: '2026-01-15', to: '2026-13-01' },
      { from: '2025-02-29', to: '2025-03-01' },
    ];
    for (const query of impossible) {
      const response = await readCheckins(tokenA, habitId, query);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'from and to must be valid YYYY-MM-DD dates',
      );
    }

    const reversed = await readCheckins(tokenA, habitId, {
      from: '2026-05-10',
      to: '2026-05-01',
    });
    expect(reversed.status).toBe(400);
    expect(reversed.body.message).toBe('from must be on or before to');

    const tooLong = await readCheckins(tokenA, habitId, {
      from: '2026-01-01',
      to: '2026-03-04',
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toBe('from and to must span at most 62 days');
  });

  it('requires a token', async () => {
    const response = await request(server())
      .get('/habits/1/checkins')
      .query({ from: '2026-01-01', to: '2026-01-31' });
    expect(response.status).toBe(401);
  });
});

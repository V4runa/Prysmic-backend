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
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { MoodOptionController } from './mood-option.controller';
import { MoodOption } from './mood-option.entity';
import { MoodOptionService } from './mood-option.service';
import { MoodController } from './mood.controller';
import { Mood } from './mood.entity';
import { MoodService } from './mood.service';

/* In-memory rows and supertest bodies are loose. The assertions are the id
   contract: a bad id, a missing id, and someone else's id are all 404s. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-mood-id-secret';
const USER_A_ID = 101;
const USER_B_ID = 202;
const MOOD_A_ID = 11;
const MOOD_B_ID = 22;
const OPTION_A_ID = 31;
const OPTION_B_ID = 32;
const NOTE_A = 'alpha-private-mood-note';
const NOTE_B = 'beta-private-mood-note';
const LABEL_B = 'beta-private-mood';

const NOT_FOUND = {
  statusCode: 404,
  message: 'Not found',
  error: 'Not Found',
};

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
};

type StoredMood = {
  id: number;
  userId: number;
  moodType: string;
  emoji: string;
  date: string;
  note?: string;
};

type StoredOption = {
  id: number;
  userId: number;
  label: string;
  emoji: string;
  color: string;
  sortOrder: number;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
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
  const moods: StoredMood[] = [
    {
      id: MOOD_A_ID,
      userId: USER_A_ID,
      moodType: 'Calm',
      emoji: '🌿',
      date: '2026-05-01',
      note: NOTE_A,
    },
    {
      id: MOOD_B_ID,
      userId: USER_B_ID,
      moodType: 'Secret',
      emoji: '🔒',
      date: '2026-05-01',
      note: NOTE_B,
    },
  ];
  const options: StoredOption[] = [
    {
      id: OPTION_A_ID,
      userId: USER_A_ID,
      label: 'Calm',
      emoji: '🌿',
      color: 'cyan',
      sortOrder: 0,
    },
    {
      id: OPTION_B_ID,
      userId: USER_B_ID,
      label: LABEL_B,
      emoji: '🔒',
      color: 'amber',
      sortOrder: 0,
    },
  ];

  const userRepo = {
    async findOne(options?: {
      where?: { id?: unknown };
    }): Promise<StoredUser | null> {
      const id = asNumber(options?.where?.id);
      const found = users.find((user) => user.id === id);
      return found ? { ...found } : null;
    },
  };

  function ownerId(
    where: { user?: { id?: unknown } } | undefined,
  ): number | undefined {
    if (!where?.user || !('id' in where.user)) return undefined;
    return asNumber(where.user.id);
  }

  const moodRepo = {
    async findOne(query?: {
      where?: { id?: unknown; user?: { id?: unknown } };
    }): Promise<StoredMood | null> {
      const where = query?.where ?? {};
      const id = asNumber(where.id);
      const userId = ownerId(where);
      const found = moods.find(
        (mood) =>
          mood.id === id && (userId === undefined || mood.userId === userId),
      );
      return found ? { ...found } : null;
    },
    async remove(mood: { id?: unknown }): Promise<void> {
      const id = asNumber(mood.id);
      const index = moods.findIndex((row) => row.id === id);
      if (index >= 0) moods.splice(index, 1);
    },
  };

  const optionRepo = {
    async findOne(query?: {
      where?: { id?: unknown; user?: { id?: unknown }; label?: string };
    }): Promise<StoredOption | null> {
      const where = query?.where ?? {};
      const id = asNumber(where.id);
      const userId = ownerId(where);
      const found = options.find((option) => {
        if (id !== undefined && option.id !== id) return false;
        if (userId !== undefined && option.userId !== userId) return false;
        if (where.label !== undefined && option.label !== where.label) {
          return false;
        }
        return id !== undefined || userId !== undefined || !!where.label;
      });
      return found ? { ...found } : null;
    },
    async save(option: StoredOption): Promise<StoredOption> {
      const index = options.findIndex((row) => row.id === option.id);
      if (index >= 0) {
        options[index] = { ...options[index], ...option };
        return { ...options[index] };
      }
      options.push(option);
      return { ...option };
    },
    async remove(option: { id?: unknown }): Promise<void> {
      const id = asNumber(option.id);
      const index = options.findIndex((row) => row.id === id);
      if (index >= 0) options.splice(index, 1);
    },
  };

  return { userRepo, moodRepo, optionRepo, moods, options };
}

describe('Mood and mood-option ids', () => {
  let app: INestApplication;
  let memory: ReturnType<typeof createMemory>;
  let tokenA: string;

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
      controllers: [MoodController, MoodOptionController],
      providers: [
        MoodService,
        MoodOptionService,
        UserService,
        AuthRateLimiter,
        JwtStrategy,
        { provide: getRepositoryToken(Mood), useValue: memory.moodRepo },
        {
          provide: getRepositoryToken(MoodOption),
          useValue: memory.optionRepo,
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
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('answers a malformed mood id with 404', async () => {
    for (const url of [
      '/moods/abc',
      '/moods/all',
      '/moods/1.5',
      '/moods/2147483648',
    ]) {
      const response = await request(server()).delete(url).set(auth(tokenA));
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
      expect(JSON.stringify(response.body)).not.toContain(NOTE_A);
      expect(JSON.stringify(response.body)).not.toContain(NOTE_B);
    }
  });

  it('gives another user the same 404 as a missing mood, and still deletes the owner copy', async () => {
    const missing = await request(server())
      .delete('/moods/999999')
      .set(auth(tokenA));
    const foreign = await request(server())
      .delete(`/moods/${MOOD_B_ID}`)
      .set(auth(tokenA));
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.message).toBe('Mood entry not found');
    expect(JSON.stringify(foreign.body)).not.toContain(NOTE_B);
    expect(memory.moods.some((mood) => mood.id === MOOD_B_ID)).toBe(true);

    const own = await request(server())
      .delete(`/moods/${MOOD_A_ID}`)
      .set(auth(tokenA));
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ message: 'Mood entry deleted successfully' });
    expect(memory.moods.some((mood) => mood.id === MOOD_A_ID)).toBe(false);
  });

  it('answers a malformed mood-option id with 404', async () => {
    for (const [method, url] of [
      ['put', '/mood-options/abc'],
      ['delete', '/mood-options/xyz'],
      ['put', '/mood-options/1.5'],
      ['delete', '/mood-options/2147483648'],
    ] as const) {
      const response = await request(server())
        [method](url)
        .set(auth(tokenA))
        .send(method === 'put' ? { label: 'Renamed' } : undefined);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
      expect(JSON.stringify(response.body)).not.toContain(LABEL_B);
    }
  });

  it("gives another user the same 404 as a missing mood option, and still updates the owner's", async () => {
    const missing = await request(server())
      .put('/mood-options/999999')
      .set(auth(tokenA))
      .send({ label: 'Stolen' });
    const foreign = await request(server())
      .put(`/mood-options/${OPTION_B_ID}`)
      .set(auth(tokenA))
      .send({ label: 'Stolen' });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.message).toBe('Mood not found.');
    expect(JSON.stringify(foreign.body)).not.toContain(LABEL_B);
    expect(
      memory.options.find((option) => option.id === OPTION_B_ID)?.label,
    ).toBe(LABEL_B);

    const own = await request(server())
      .put(`/mood-options/${OPTION_A_ID}`)
      .set(auth(tokenA))
      .send({ label: 'Steady' });
    expect(own.status).toBe(200);
    expect(own.body.label).toBe('Steady');
    expect(own.body.id).toBe(OPTION_A_ID);

    const missingDelete = await request(server())
      .delete('/mood-options/999998')
      .set(auth(tokenA));
    const foreignDelete = await request(server())
      .delete(`/mood-options/${OPTION_B_ID}`)
      .set(auth(tokenA));
    expect(foreignDelete.status).toBe(404);
    expect(foreignDelete.body).toEqual(missingDelete.body);
    expect(memory.options.some((option) => option.id === OPTION_B_ID)).toBe(
      true,
    );
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { OnboardingService } from '../onboarding/onboarding.service';
import { User } from './user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/* In-memory user rows and supertest bodies are loose by design.
   The assertions are the ownership and serialization contract. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */

const TEST_JWT_SECRET = 'test-only-users-ownership-secret';

const PASS_A = 'synth-passphrase-a';
const PASS_B = 'synth-passphrase-b';
const EMAIL_A = 'synth-a@example.test';
const EMAIL_B = 'synth-b@example.test';
const NAME_A = 'synth-owner-a';
const NAME_B = 'synth-owner-b';

type StoredUser = {
  id: number;
  username: string;
  email: string;
  password: string;
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

function createMemory() {
  const users: StoredUser[] = [];
  let seq = 0;

  const repo = {
    create(partial: Partial<StoredUser>): StoredUser {
      return {
        id: 0,
        username: '',
        email: '',
        password: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
      };
    },
    async save(user: StoredUser): Promise<StoredUser> {
      if (!user.id) {
        seq += 1;
        user.id = seq;
        users.push(user);
        return user;
      }
      const existing = users.find((row) => row.id === user.id);
      if (existing) {
        Object.assign(existing, user, { updatedAt: new Date() });
        return existing;
      }
      users.push(user);
      return user;
    },
    async find(options?: {
      where?: { id?: unknown; email?: string; username?: string };
    }): Promise<StoredUser[]> {
      const where = options?.where;
      if (!where) return users.map((row) => ({ ...row }));
      const id = asNumber(where.id);
      return users
        .filter((row) => (id === undefined ? true : row.id === id))
        .filter((row) => (where.email ? row.email === where.email : true))
        .filter((row) =>
          where.username ? row.username === where.username : true,
        )
        .map((row) => ({ ...row }));
    },
    async findOne(options?: {
      where?: { id?: unknown; email?: string; username?: string };
    }): Promise<StoredUser | null> {
      const rows = await repo.find(options);
      return rows[0] ?? null;
    },
    async remove(user: { id?: unknown }): Promise<void> {
      const id = asNumber(user.id);
      const index = users.findIndex((row) => row.id === id);
      if (index >= 0) users.splice(index, 1);
    },
  };

  return { repo, users };
}

describe('User ownership and password serialization', () => {
  let app: INestApplication;
  let users: StoredUser[];
  let tokenA: string;
  let tokenB: string;
  let idA: number;
  let idB: number;

  beforeAll(async () => {
    const memory = createMemory();
    users = memory.users;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({ JWT_SECRET: TEST_JWT_SECRET })],
        }),
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController, UserController],
      providers: [
        AuthService,
        UserService,
        JwtStrategy,
        {
          provide: OnboardingService,
          useValue: { seedSampleData: () => Promise.resolve() },
        },
        { provide: getRepositoryToken(User), useValue: memory.repo },
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

    const signupA = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ username: NAME_A, email: EMAIL_A, password: PASS_A });
    const signupB = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ username: NAME_B, email: EMAIL_B, password: PASS_B });
    tokenA = signupA.body.access_token;
    tokenB = signupB.body.access_token;
    idA = users.find((user) => user.email === EMAIL_A)!.id;
    idB = users.find((user) => user.email === EMAIL_B)!.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('signs up and logs in without returning a password, and the hash still matches', async () => {
    const signup = await request(server()).post('/auth/signup').send({
      username: 'synth-owner-c',
      email: 'synth-c@example.test',
      password: 'synth-passphrase-c',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.access_token).toEqual(expect.any(String));
    expect(signup.body.password).toBeUndefined();
    expect(JSON.stringify(signup.body)).not.toContain('synth-passphrase-c');
    const stored = users.find((user) => user.email === 'synth-c@example.test');
    expect(stored).toBeDefined();
    expect(stored!.password).not.toBe('synth-passphrase-c');
    expect(await bcrypt.compare('synth-passphrase-c', stored!.password)).toBe(
      true,
    );
    expect(JSON.stringify(signup.body)).not.toContain(stored!.password);

    const login = await request(server())
      .post('/auth/login')
      .send({ identifier: 'synth-owner-c', password: 'synth-passphrase-c' });
    expect(login.status).toBe(201);
    expect(login.body.access_token).toEqual(expect.any(String));
    expect(JSON.stringify(login.body)).not.toContain('synth-passphrase-c');
    expect(JSON.stringify(login.body)).not.toContain(stored!.password);

    const wrong = await request(server())
      .post('/auth/login')
      .send({ identifier: 'synth-owner-c', password: 'not-the-passphrase' });
    const missing = await request(server()).post('/auth/login').send({
      identifier: 'nobody-synth@example.test',
      password: 'not-the-passphrase',
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect(JSON.stringify(wrong.body)).not.toContain(stored!.password);
  });

  it('rejects unauthenticated user routes with 401', async () => {
    for (const [method, url] of [
      ['get', '/users'],
      ['get', `/users/${idA}`],
      ['put', `/users/${idA}`],
      ['delete', `/users/${idA}`],
    ] as const) {
      const response = await request(server())[method](url);
      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain(EMAIL_A);
      expect(JSON.stringify(response.body)).not.toContain(PASS_A);
    }
  });

  it('returns only the caller from the list and from self read, with no password', async () => {
    const list = await request(server()).get('/users').set(auth(tokenA));
    expect(list.status).toBe(200);
    const listed = Array.isArray(list.body) ? list.body : [list.body];
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(idA);
    expect(listed[0].email).toBe(EMAIL_A);
    expect(listed[0].username).toBe(NAME_A);
    expect(listed[0].password).toBeUndefined();
    expect(JSON.stringify(list.body)).not.toContain(PASS_A);
    expect(JSON.stringify(list.body)).not.toContain(EMAIL_B);
    expect(JSON.stringify(list.body)).not.toContain(NAME_B);
    const hashA = users.find((user) => user.id === idA)!.password;
    expect(JSON.stringify(list.body)).not.toContain(hashA);

    const self = await request(server()).get(`/users/${idA}`).set(auth(tokenA));
    expect(self.status).toBe(200);
    expect(self.body).toMatchObject({
      id: idA,
      username: NAME_A,
      email: EMAIL_A,
    });
    expect(self.body.password).toBeUndefined();
    expect(JSON.stringify(self.body)).not.toContain(hashA);
    expect(JSON.stringify(self.body)).not.toContain(PASS_A);

    const ownEmail = await request(server())
      .get(`/users/email/${encodeURIComponent(EMAIL_A)}`)
      .set(auth(tokenA));
    expect(ownEmail.status).toBe(200);
    expect(ownEmail.body).toMatchObject({ id: idA, email: EMAIL_A });
    expect(ownEmail.body.password).toBeUndefined();
    expect(JSON.stringify(ownEmail.body)).not.toContain(hashA);
  });

  it('hides another user behind the same 404 as a missing id', async () => {
    const missing = await request(server())
      .get('/users/999999')
      .set(auth(tokenA));
    const foreign = await request(server())
      .get(`/users/${idB}`)
      .set(auth(tokenA));
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.message).toBe('User not found');
    expect(JSON.stringify(foreign.body)).not.toContain(EMAIL_B);
    expect(JSON.stringify(foreign.body)).not.toContain(NAME_B);
    expect(JSON.stringify(foreign.body)).not.toContain(PASS_B);

    const byEmail = await request(server())
      .get(`/users/email/${encodeURIComponent(EMAIL_B)}`)
      .set(auth(tokenA));
    expect(byEmail.status).toBe(404);
    expect(byEmail.body.message).toBe('User not found');
    expect(JSON.stringify(byEmail.body)).not.toContain(EMAIL_B);
    expect(JSON.stringify(byEmail.body)).not.toContain(PASS_B);

    const byName = await request(server())
      .get(`/users/username/${NAME_B}`)
      .set(auth(tokenA));
    expect(byName.status).toBe(404);
    expect(byName.body.message).toBe('User not found');
    expect(JSON.stringify(byName.body)).not.toContain(PASS_B);
    expect(JSON.stringify(byName.body)).not.toContain(EMAIL_B);
  });

  it('lets the caller update their own profile fields and not their password or another user', async () => {
    const hashBefore = users.find((user) => user.id === idA)!.password;

    const renamed = await request(server())
      .put(`/users/${idA}`)
      .set(auth(tokenA))
      .send({ username: 'synth-owner-a-renamed' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.username).toBe('synth-owner-a-renamed');
    expect(renamed.body.email).toBe(EMAIL_A);
    expect(renamed.body.password).toBeUndefined();
    expect(JSON.stringify(renamed.body)).not.toContain(hashBefore);
    expect(users.find((user) => user.id === idA)!.password).toBe(hashBefore);

    const relogin = await request(server())
      .post('/auth/login')
      .send({ identifier: 'synth-owner-a-renamed', password: PASS_A });
    expect(relogin.status).toBe(201);
    expect(JSON.stringify(relogin.body)).not.toContain(PASS_A);
    expect(JSON.stringify(relogin.body)).not.toContain(hashBefore);

    const passwordWrite = await request(server())
      .put(`/users/${idA}`)
      .set(auth(tokenA))
      .send({ password: 'replacement-passphrase' });
    expect(passwordWrite.status).toBe(400);
    expect(users.find((user) => user.id === idA)!.password).toBe(hashBefore);
    expect(JSON.stringify(passwordWrite.body)).not.toContain(
      'replacement-passphrase',
    );
    const stillOriginal = await request(server())
      .post('/auth/login')
      .send({ identifier: 'synth-owner-a-renamed', password: PASS_A });
    expect(stillOriginal.status).toBe(201);

    const ownershipWrite = await request(server())
      .put(`/users/${idA}`)
      .set(auth(tokenA))
      .send({ id: idB, role: 'admin', username: 'should-not-apply' });
    expect(ownershipWrite.status).toBe(400);
    expect(users.find((user) => user.id === idA)!.username).toBe(
      'synth-owner-a-renamed',
    );
    expect(users.find((user) => user.id === idB)!.username).toBe(NAME_B);

    const missingUpdate = await request(server())
      .put('/users/999999')
      .set(auth(tokenA))
      .send({ username: 'nope' });
    const foreignUpdate = await request(server())
      .put(`/users/${idB}`)
      .set(auth(tokenA))
      .send({ username: 'taken-over', email: 'taken@example.test' });
    expect(foreignUpdate.status).toBe(404);
    expect(foreignUpdate.body).toEqual(missingUpdate.body);
    expect(users.find((user) => user.id === idB)!.username).toBe(NAME_B);
    expect(users.find((user) => user.id === idB)!.email).toBe(EMAIL_B);
    expect(JSON.stringify(foreignUpdate.body)).not.toContain(EMAIL_B);

    const clash = await request(server())
      .put(`/users/${idA}`)
      .set(auth(tokenA))
      .send({ email: EMAIL_B });
    expect(clash.status).toBe(400);
    expect(JSON.stringify(clash.body).toLowerCase()).not.toMatch(
      /already|exists|taken/,
    );
    expect(users.find((user) => user.id === idA)!.email).toBe(EMAIL_A);
    expect(JSON.stringify(clash.body)).not.toContain(PASS_A);
  });

  it('does not let one user delete another, and does not expose account creation', async () => {
    const missing = await request(server())
      .delete('/users/999998')
      .set(auth(tokenA));
    const foreign = await request(server())
      .delete(`/users/${idB}`)
      .set(auth(tokenA));
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(users.some((user) => user.id === idB)).toBe(true);

    const selfB = await request(server())
      .get(`/users/${idB}`)
      .set(auth(tokenB));
    expect(selfB.status).toBe(200);
    expect(selfB.body).toMatchObject({
      id: idB,
      email: EMAIL_B,
      username: NAME_B,
    });
    expect(selfB.body.password).toBeUndefined();
    const hashB = users.find((user) => user.id === idB)!.password;
    expect(JSON.stringify(selfB.body)).not.toContain(hashB);
    expect(JSON.stringify(selfB.body)).not.toContain(PASS_B);

    const created = await request(server())
      .post('/users')
      .set(auth(tokenA))
      .send({
        username: 'synth-planted',
        email: 'synth-planted@example.test',
        password: 'planted-passphrase',
      });
    expect(created.status).toBe(404);
    expect(JSON.stringify(created.body)).not.toContain('planted-passphrase');
    expect(
      users.some((user) => user.email === 'synth-planted@example.test'),
    ).toBe(false);
    const plantedLogin = await request(server())
      .post('/auth/login')
      .send({ identifier: 'synth-planted', password: 'planted-passphrase' });
    expect(plantedLogin.status).toBe(401);
  });
});

import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import {
  assertPasswordAllowed,
  commonPasswordCount,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from './password-policy';
import { User } from '../users/user.entity';

const LONG_OK = 'Zx'.repeat(PASSWORD_MAX_BYTES / 2);

describe('password policy', () => {
  it('loads the bundled common-password list without a network call', () => {
    expect(commonPasswordCount()).toBeGreaterThanOrEqual(10_000);
  });

  it('rejects short, oversized, personal, and common passwords with distinct messages', () => {
    expect(() => assertPasswordAllowed('abc1234')).toThrow(
      new BadRequestException(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      ),
    );
    expect(() =>
      assertPasswordAllowed('x'.repeat(PASSWORD_MAX_BYTES + 1)),
    ).toThrow(`Password must be at most ${PASSWORD_MAX_BYTES} bytes.`);
    // 37 accented characters are under a long character count and over 72 bytes.
    expect(() => assertPasswordAllowed('é'.repeat(37))).toThrow(
      `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`,
    );
    expect(() =>
      assertPasswordAllowed(LONG_OK, {
        email: 'Person@Example.test',
        username: 'Notebook',
      }),
    ).not.toThrow();
    expect(() => assertPasswordAllowed('é'.repeat(36))).not.toThrow();

    const identity = {
      email: 'Riverstone@Example.test',
      username: 'Notebook',
    };
    expect(() =>
      assertPasswordAllowed('riverstone@example.test', identity),
    ).toThrow('Password cannot be your email address.');
    expect(() => assertPasswordAllowed('RIVERSTONE', identity)).toThrow(
      'Password cannot be the part of your email before @.',
    );
    expect(() =>
      assertPasswordAllowed('notebook', {
        email: 'mail-keeper@example.test',
        username: 'Notebook',
      }),
    ).toThrow('Password cannot be your username.');
    expect(() =>
      assertPasswordAllowed('Password', {
        email: 'mail-keeper@example.test',
        username: 'Notebook',
      }),
    ).toThrow('That password is too common. Choose a different one.');
  });

  it('does not apply the policy when an existing password is used to log in', async () => {
    const common = await account('password');
    const short = await account('abc123');
    expect(() =>
      assertPasswordAllowed('password', {
        email: common.email,
        username: common.username,
      }),
    ).toThrow(BadRequestException);
    expect(() => assertPasswordAllowed('abc123')).toThrow(BadRequestException);

    const commonSession = await service(common).login({
      identifier: common.email,
      password: 'password',
    });
    const shortSession = await service(short).login({
      identifier: short.username,
      password: 'abc123',
    });
    expect(commonSession.access_token).toEqual(expect.any(String));
    expect(shortSession.access_token).toEqual(expect.any(String));
    expect(JSON.stringify(commonSession)).not.toContain('password');
  });

  it('rejects a new signup password before looking the account up', async () => {
    const findByUsername = jest.fn();
    const create = jest.fn();
    const auth = new AuthService(
      {
        findByUsername,
        create,
        emailTakenBySomeoneElse: jest.fn(),
        usernameCollidesWithEmail: jest.fn(),
      } as never,
      new JwtService({ secret: 'unit-secret' }),
      { seedSampleData: () => Promise.resolve() } as never,
      { sendVerificationEmail: () => undefined } as never,
    );

    await expect(
      auth.signup({
        username: 'Notebook',
        email: 'notebook@example.test',
        password: 'password',
      }),
    ).rejects.toThrow('That password is too common');
    expect(findByUsername).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

async function account(password: string): Promise<User> {
  return {
    id: password.length,
    username: `kept-${password.length}`,
    email: `kept-${password.length}@example.test`,
    password: await bcrypt.hash(password, 4),
    emailVerified: true,
    sessionVersion: 0,
  } as User;
}

function service(user: User): AuthService {
  return new AuthService(
    {
      findByUsername: (identifier: string) =>
        Promise.resolve(identifier === user.username ? user : null),
      findByEmail: (identifier: string) =>
        Promise.resolve(identifier.toLowerCase() === user.email ? user : null),
    } as never,
    new JwtService({ secret: 'unit-secret' }),
    { seedSampleData: () => Promise.resolve() } as never,
    { sendVerificationEmail: () => undefined } as never,
  );
}

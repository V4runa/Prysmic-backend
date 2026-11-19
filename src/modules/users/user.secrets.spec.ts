import { UserService } from './user.service';
import { userQueryBuilder } from '../../testing/user-query';

const row = {
  id: 1,
  username: 'Keeper',
  email: 'Keeper@Example.test',
  password: 'stored-hash',
  sessionVersion: 3,
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function service(repo: object): UserService {
  return new UserService(
    repo as never,
    { manager: {} } as never,
    { assert: () => undefined } as never,
  );
}

describe('user reads do not carry secret columns', () => {
  it('selects public columns for an email lookup and addSelects secrets for login', async () => {
    const rows = [row];
    const users = service({
      createQueryBuilder: () => userQueryBuilder(rows),
    });

    const listed = await users.findByEmail('keeper@example.test');
    expect(listed?.id).toBe(1);
    expect(listed?.email).toBe('Keeper@Example.test');
    expect(listed?.password).toBeUndefined();
    expect(listed?.sessionVersion).toBeUndefined();

    const auth = await users.findByEmailForAuth('keeper@example.test');
    expect(auth?.password).toBe('stored-hash');
    expect(auth?.sessionVersion).toBe(3);

    const byName = await users.findByUsernameForAuth('Keeper');
    expect(byName?.password).toBe('stored-hash');
    expect(byName?.sessionVersion).toBe(3);
  });

  it('strips secrets from the legacy case-variant email lookup', async () => {
    const users = service({
      async findOne(options?: { where?: { email?: string } }) {
        if (options?.where?.email === 'Keeper@Example.test') return { ...row };
        return null;
      },
    });

    const found = await users.findByEmail('Keeper@Example.test');
    expect(found?.email).toBe('Keeper@Example.test');
    expect(found?.username).toBe('Keeper');
    expect(found?.password).toBeUndefined();
    expect(found?.sessionVersion).toBeUndefined();
  });
});

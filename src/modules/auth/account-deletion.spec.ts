import * as bcrypt from 'bcrypt';
import { INVALID_CREDENTIALS, INVALID_LINK } from './account.constants';
import { AccountLifecycleService } from './account-lifecycle.service';
import { EmailDelivery } from './email/email.delivery';
import { renderAccountDeletedEmail } from './email/email.templates';
import type { EmailProvider, OutboundEmail } from './email/email.types';
import { RateLimitError } from './rate-limit';

const PASSWORD = 'correct-horse-passphrase';

class MemoryProvider implements EmailProvider {
  readonly sent: OutboundEmail[] = [];

  constructor(
    private readonly configured: boolean,
    private readonly fail = false,
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  send(message: OutboundEmail): Promise<void> {
    if (this.fail) return Promise.reject(new Error('provider down'));
    this.sent.push(message);
    return Promise.resolve();
  }
}

describe('account deletion', () => {
  it('describes the deletion in a short letter with no link', () => {
    const letter = renderAccountDeletedEmail();
    expect(letter.subject).toBe('Your Prysmic account has been deleted');
    expect(letter.text).toContain('Your Prysmic account has been deleted');
    expect(letter.html).toContain('Your Prysmic account has been deleted');
    expect(letter.html).not.toContain('href=');
    expect(letter.text).not.toContain('token=');
  });

  it('deletes only after the current password matches, then sends the letter', async () => {
    const { service, queries, provider, assertLimit } = await harness(true);
    await expect(
      service.deleteAccount(7, 'wrong-passphrase-here', '203.0.113.9'),
    ).rejects.toThrow(INVALID_CREDENTIALS);
    expect(queries).toHaveLength(0);
    expect(provider.sent).toHaveLength(0);
    expect(assertLimit).toHaveBeenCalledWith(
      'account_delete',
      'gone@example.test',
      '203.0.113.9',
    );

    await service.deleteAccount(7, PASSWORD, '203.0.113.9');
    await service.settleMail();
    const sql = queries.join('\n');
    for (const fragment of [
      'DELETE FROM "note_tags"',
      'DELETE FROM "task_tags"',
      'DELETE FROM "habit_check"',
      'SET "originNoteId" = NULL',
      'DELETE FROM "note_attachments"',
      'DELETE FROM "calendar_event"',
      'DELETE FROM "mood" WHERE',
      'DELETE FROM "mood_options"',
      'DELETE FROM "habit" WHERE',
      'DELETE FROM "task" WHERE',
      'DELETE FROM "notes"',
      'DELETE FROM "tags"',
      'DELETE FROM "auth_tokens"',
      'DELETE FROM "users"',
    ]) {
      expect(sql).toContain(fragment);
    }
    expect(sql.indexOf('SET "originNoteId" = NULL')).toBeLessThan(
      sql.indexOf('DELETE FROM "notes"'),
    );
    expect(sql.indexOf('DELETE FROM "note_tags"')).toBeLessThan(
      sql.indexOf('DELETE FROM "tags"'),
    );
    expect(sql.indexOf('DELETE FROM "auth_tokens"')).toBeLessThan(
      sql.indexOf('DELETE FROM "users"'),
    );
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].to).toBe('gone@example.test');
    expect(provider.sent[0].subject).toBe(
      'Your Prysmic account has been deleted',
    );
    expect(provider.sent[0].text).not.toContain(PASSWORD);
  });

  it('stops a deletion when the rate limit is already spent', async () => {
    const { service, queries } = await harness(true, () => {
      throw new RateLimitError(12);
    });
    await expect(
      service.deleteAccount(7, PASSWORD, '203.0.113.9'),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(queries).toHaveLength(0);
  });

  it('still deletes when email is not configured or the provider fails', async () => {
    const quiet = await harness(false);
    await quiet.service.deleteAccount(7, PASSWORD, '127.0.0.1');
    await quiet.service.settleMail();
    expect(
      quiet.queries.some((sql) => sql.includes('DELETE FROM "users"')),
    ).toBe(true);
    expect(quiet.provider.sent).toHaveLength(0);

    const failing = await harness(true, undefined, true);
    await failing.service.deleteAccount(7, PASSWORD, '127.0.0.1');
    await expect(failing.service.settleMail()).resolves.toBeUndefined();
    expect(
      failing.queries.some((sql) => sql.includes('DELETE FROM "users"')),
    ).toBe(true);
    expect(failing.provider.sent).toHaveLength(0);
  });

  it('does not email an address that was never verified', async () => {
    const unverified = await harness(true, () => undefined, false, false);
    await unverified.service.deleteAccount(7, PASSWORD, '127.0.0.1');
    await unverified.service.settleMail();
    expect(
      unverified.queries.some((sql) => sql.includes('DELETE FROM "users"')),
    ).toBe(true);
    expect(unverified.provider.sent).toHaveLength(0);
  });

  it('does not consume a reset link when the new password is rejected', async () => {
    const consume = jest.fn();
    const transaction = jest.fn();
    const peekUserId = jest.fn().mockResolvedValue(4);
    const lifecycle = new AccountLifecycleService(
      {
        findById: () =>
          Promise.resolve({
            id: 4,
            email: 'kept@example.test',
            username: 'kept-name',
          }),
      } as never,
      { peekUserId, consume } as never,
      delivery(new MemoryProvider(true)),
      { assert: () => undefined } as never,
      { transaction } as never,
    );

    await expect(lifecycle.resetPassword('   ', PASSWORD)).rejects.toThrow(
      INVALID_LINK,
    );
    expect(peekUserId).not.toHaveBeenCalled();

    peekUserId.mockResolvedValue(null);
    await expect(
      lifecycle.resetPassword('raw-token', PASSWORD),
    ).rejects.toThrow(INVALID_LINK);
    expect(consume).not.toHaveBeenCalled();

    peekUserId.mockResolvedValue(4);
    await expect(
      lifecycle.resetPassword('raw-token', 'password'),
    ).rejects.toThrow('That password is too common');
    await expect(
      lifecycle.resetPassword('raw-token', 'kept@example.test'),
    ).rejects.toThrow('Password cannot be your email address.');
    await expect(
      lifecycle.resetPassword('raw-token', 'kept-name'),
    ).rejects.toThrow('Password cannot be your username.');
    expect(consume).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores a reset password only after the policy accepts it', async () => {
    const consume = jest.fn().mockResolvedValue(4);
    const replacePasswordHash = jest.fn().mockResolvedValue(true);
    const revokeUnused = jest.fn().mockResolvedValue(undefined);
    const lifecycle = new AccountLifecycleService(
      {
        findById: () =>
          Promise.resolve({
            id: 4,
            email: 'kept@example.test',
            username: 'kept-name',
          }),
        replacePasswordHash,
      } as never,
      { peekUserId: () => Promise.resolve(4), consume, revokeUnused } as never,
      delivery(new MemoryProvider(true)),
      { assert: () => undefined } as never,
      {
        transaction: (work: (manager: unknown) => Promise<void>) => work({}),
      } as never,
    );

    await lifecycle.resetPassword('raw-token', PASSWORD);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(revokeUnused).toHaveBeenCalledTimes(1);
    const stored: unknown = (
      replacePasswordHash.mock.calls as unknown[][]
    )[0]?.[2];
    expect(typeof stored).toBe('string');
    if (typeof stored !== 'string') return;
    expect(stored).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, stored)).toBe(true);
  });
});

function delivery(provider: EmailProvider): EmailDelivery {
  return new EmailDelivery(provider, { get: () => undefined } as never);
}

async function harness(
  configured: boolean,
  assertLimit: (bucket: string, email: string, ip: string) => void = () =>
    undefined,
  fail = false,
  emailVerified = true,
) {
  const queries: string[] = [];
  const provider = new MemoryProvider(configured, fail);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const assert = jest.fn(assertLimit);
  const service = new AccountLifecycleService(
    {
      findById: (id: number) =>
        Promise.resolve(
          id === 7
            ? {
                id: 7,
                email: 'gone@example.test',
                username: 'gone',
                password: hash,
                emailVerified,
              }
            : null,
        ),
    } as never,
    {} as never,
    delivery(provider),
    { assert } as never,
    {
      transaction: (
        work: (manager: {
          query: (sql: string) => Promise<unknown>;
        }) => Promise<boolean>,
      ) =>
        work({
          query: (sql: string) => {
            queries.push(sql);
            if (sql.includes('FOR UPDATE')) return Promise.resolve([{ id: 7 }]);
            if (sql.includes('DELETE FROM "users"')) {
              return Promise.resolve([[{ id: 7 }], 1]);
            }
            return Promise.resolve([]);
          },
        }),
    } as never,
  );
  return { service, queries, provider, assertLimit: assert };
}

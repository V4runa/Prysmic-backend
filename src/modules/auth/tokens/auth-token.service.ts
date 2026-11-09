import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  AUTH_TOKEN_PURPOSE,
  type AuthTokenPurpose,
} from '../account.constants';
import { AuthToken } from './auth-token.entity';
import { rowsFromQuery } from '../../../database/query-rows';
import { generateRawToken, hashToken, tokenHashesEqual } from './token-hash';

const DUMMY_HASH = hashToken('not-a-real-token');

type TokenRow = {
  id: number;
  userId: number;
  tokenHash: string;
  usedAt: Date | string | null;
};

@Injectable()
export class AuthTokenService {
  constructor(
    @InjectRepository(AuthToken)
    private readonly tokens: Repository<AuthToken>,
  ) {}

  async issue(
    userId: number,
    purpose: AuthTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const raw = generateRawToken();
    const row = this.tokens.create({
      userId,
      purpose,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + ttlMs),
      usedAt: null,
    });
    await this.tokens.save(row);
    return raw;
  }

  /**
   * Marks one unused, unexpired token as used and returns its user id.
   * Lookup is by hash. The digest is also compared in constant time.
   */
  async consume(
    manager: EntityManager,
    rawToken: string,
    purpose: AuthTokenPurpose,
  ): Promise<number | null> {
    const computed = hashToken(rawToken);
    const rows = rowsFromQuery<TokenRow>(
      await manager.query(
        `SELECT "id", "userId", "tokenHash", "usedAt"
         FROM "auth_tokens"
         WHERE "tokenHash" = $1 AND "purpose" = $2
         LIMIT 1`,
        [computed, purpose],
      ),
    );
    const row = rows[0];
    const stored = row?.tokenHash ?? DUMMY_HASH;
    if (!tokenHashesEqual(stored, computed) || !row) return null;

    const updated = rowsFromQuery<{ id: number; userId: number }>(
      await manager.query(
        `UPDATE "auth_tokens"
         SET "usedAt" = NOW()
         WHERE "id" = $1 AND "usedAt" IS NULL AND "expiresAt" > NOW()
         RETURNING "id", "userId"`,
        [row.id],
      ),
    );
    return updated[0]?.userId ?? null;
  }

  async revokeUnused(
    manager: EntityManager,
    userId: number,
    purpose: AuthTokenPurpose,
  ): Promise<void> {
    await manager.query(
      `UPDATE "auth_tokens"
       SET "usedAt" = NOW()
       WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL`,
      [userId, purpose],
    );
  }

  /** Used when an address changes, outside the confirm transaction. */
  async revokeUnusedVerification(userId: number): Promise<void> {
    await this.tokens.manager.query(
      `UPDATE "auth_tokens"
       SET "usedAt" = NOW()
       WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL`,
      [userId, AUTH_TOKEN_PURPOSE.emailVerification],
    );
  }
}

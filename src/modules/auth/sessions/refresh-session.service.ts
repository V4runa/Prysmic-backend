import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { REFRESH_TTL_MS } from '../account.constants';
import { rowsFromQuery } from '../../../database/query-rows';
import {
  generateRawToken,
  hashToken,
  tokenHashesEqual,
} from '../tokens/token-hash';

const DUMMY_HASH = hashToken('not-a-refresh-token');
const MAX_TOKEN_LENGTH = 512;

export type RefreshFailure = 'expired' | 'revoked';

export type RefreshRotation =
  | { ok: true; userId: number; refreshToken: string }
  | { ok: false; reason: RefreshFailure };

type SessionRow = {
  id: number;
  userId: number;
  familyId: string;
  tokenHash: string;
  expiresAt: Date | string;
  rotatedAt: Date | string | null;
  revokedAt: Date | string | null;
};

@Injectable()
export class RefreshSessionService {
  private readonly logger = new Logger(RefreshSessionService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Starts a new family. Callers store the raw token in the cookie only. */
  async issue(userId: number, manager?: EntityManager): Promise<string> {
    const db = manager ?? this.dataSource;
    await this.prune(db);
    const raw = generateRawToken();
    await db.query(
      `INSERT INTO "refresh_tokens"
         ("userId", "familyId", "tokenHash", "expiresAt")
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        randomUUID(),
        hashToken(raw),
        new Date(Date.now() + REFRESH_TTL_MS),
      ],
    );
    return raw;
  }

  /**
   * Exchanges a live token for a new one in the same family and slides the
   * expiry. A token that was already rotated revokes the whole family.
   */
  async rotate(raw: string | null): Promise<RefreshRotation> {
    const presented = normalize(raw);
    if (!presented) return { ok: false, reason: 'revoked' };
    return this.dataSource.transaction(async (manager) => {
      const row = await lockByHash(manager, presented);
      if (!row) return { ok: false, reason: 'revoked' as const };
      if (row.revokedAt) return { ok: false, reason: 'revoked' as const };
      if (row.rotatedAt) {
        await this.revokeFamily(manager, row.familyId);
        return { ok: false, reason: 'revoked' as const };
      }

      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
      const rotated = rowsFromQuery<{ id: number }>(
        await manager.query(
          `UPDATE "refresh_tokens"
           SET "rotatedAt" = NOW(), "expiresAt" = $2
           WHERE "id" = $1
             AND "rotatedAt" IS NULL
             AND "revokedAt" IS NULL
             AND "expiresAt" > NOW()
           RETURNING "id"`,
          [row.id, expiresAt],
        ),
      );
      if (!rotated.length) return { ok: false, reason: 'expired' as const };

      const next = generateRawToken();
      await manager.query(
        `INSERT INTO "refresh_tokens"
           ("userId", "familyId", "tokenHash", "expiresAt")
         VALUES ($1, $2, $3, $4)`,
        [row.userId, row.familyId, hashToken(next), expiresAt],
      );
      // Keep earlier hashes until the sliding session itself ends, so a
      // stolen predecessor still trips reuse detection.
      await manager.query(
        `UPDATE "refresh_tokens"
         SET "expiresAt" = $2
         WHERE "familyId" = $1 AND "revokedAt" IS NULL`,
        [row.familyId, expiresAt],
      );
      return { ok: true, userId: Number(row.userId), refreshToken: next };
    });
  }

  /** Ends the family of the presented token. A missing token is a no-op. */
  async revokePresented(raw: string | null): Promise<void> {
    const presented = normalize(raw);
    if (!presented) return;
    await this.dataSource.transaction(async (manager) => {
      const row = await lockByHash(manager, presented);
      if (!row) return;
      await this.revokeFamily(manager, row.familyId);
    });
  }

  async revokeAllForUser(
    userId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const db = manager ?? this.dataSource;
    await db.query(
      `UPDATE "refresh_tokens"
       SET "revokedAt" = NOW()
       WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [userId],
    );
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE "refresh_tokens"
       SET "revokedAt" = NOW()
       WHERE "familyId" = $1 AND "revokedAt" IS NULL`,
      [familyId],
    );
  }

  private async prune(db: DataSource | EntityManager): Promise<void> {
    try {
      await db.query(
        `DELETE FROM "refresh_tokens"
         WHERE ("revokedAt" IS NOT NULL AND "revokedAt" < NOW() - INTERVAL '1 day')
            OR "expiresAt" < NOW() - INTERVAL '1 day'`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Could not prune old refresh sessions: ${detail}`);
    }
  }
}

function normalize(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TOKEN_LENGTH) return null;
  return trimmed;
}

async function lockByHash(
  manager: EntityManager,
  raw: string,
): Promise<SessionRow | null> {
  const computed = hashToken(raw);
  const rows = rowsFromQuery<SessionRow>(
    await manager.query(
      `SELECT "id", "userId", "familyId", "tokenHash", "expiresAt", "rotatedAt", "revokedAt"
       FROM "refresh_tokens"
       WHERE "tokenHash" = $1
       LIMIT 1
       FOR UPDATE`,
      [computed],
    ),
  );
  const row = rows[0];
  const stored = row?.tokenHash ?? DUMMY_HASH;
  if (!tokenHashesEqual(stored, computed) || !row) return null;
  return row;
}

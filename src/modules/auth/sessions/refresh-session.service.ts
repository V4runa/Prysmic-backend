import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { REFRESH_REUSE_GRACE_SEC, REFRESH_TTL_MS } from '../account.constants';
import { rowsFromQuery } from '../../../database/query-rows';
import {
  generateRawToken,
  hashToken,
  tokenHashesEqual,
} from '../tokens/token-hash';
import { openRefreshSeal, sealRefreshToken } from './refresh-seal';

const DUMMY_HASH = hashToken('not-a-refresh-token');
const MAX_TOKEN_LENGTH = 512;
const MAX_SEAL_HOPS = 8;

export type RefreshFailure = 'expired' | 'revoked';

export type RefreshRotation =
  | { ok: true; userId: number; refreshToken: string }
  | { ok: false; reason: RefreshFailure };

type SessionRow = {
  id: number;
  userId: number;
  familyId: string;
  tokenHash: string;
  successorSeal: string | null;
  expiresAt: Date | string;
  rotatedAt: Date | string | null;
  revokedAt: Date | string | null;
};

@Injectable()
export class RefreshSessionService {
  private readonly logger = new Logger(RefreshSessionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

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
   * expiry. A token rotated moments ago is a concurrent refresh: the caller
   * receives the family's current cookie and the family stays. Reuse after
   * the grace window revokes the family.
   */
  async rotate(raw: string | null): Promise<RefreshRotation> {
    const presented = normalize(raw);
    if (!presented) return { ok: false, reason: 'revoked' };
    await this.clearStaleSeals();
    return this.dataSource.transaction(async (manager) => {
      const row = await lockByHash(manager, presented);
      if (!row) return { ok: false, reason: 'revoked' as const };
      if (row.revokedAt) return { ok: false, reason: 'revoked' as const };
      if (row.rotatedAt) return this.replayRotated(manager, row);

      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
      const next = generateRawToken();
      const rotated = rowsFromQuery<{ id: number }>(
        await manager.query(
          `UPDATE "refresh_tokens"
           SET "rotatedAt" = NOW(),
               "expiresAt" = $2,
               "successorSeal" = $3
           WHERE "id" = $1
             AND "rotatedAt" IS NULL
             AND "revokedAt" IS NULL
             AND "expiresAt" > NOW()
           RETURNING "id"`,
          [row.id, expiresAt, sealRefreshToken(next, this.sealSecret())],
        ),
      );
      if (!rotated.length) return { ok: false, reason: 'expired' as const };

      await manager.query(
        `INSERT INTO "refresh_tokens"
           ("userId", "familyId", "tokenHash", "expiresAt")
         VALUES ($1, $2, $3, $4)`,
        [row.userId, row.familyId, hashToken(next), expiresAt],
      );
      // Keep earlier hashes until the sliding session itself ends, so a
      // stolen predecessor still trips reuse detection after the grace window.
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
       SET "revokedAt" = NOW(), "successorSeal" = NULL
       WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [userId],
    );
  }

  /**
   * The other tab already rotated this token. Inside the grace window, hand
   * back the family's current cookie. Afterwards, reuse means the family is
   * burned.
   */
  private async replayRotated(
    manager: EntityManager,
    row: SessionRow,
  ): Promise<RefreshRotation> {
    if (!(await rotatedWithinGrace(manager, row.id))) {
      await this.revokeFamily(manager, row.familyId);
      return { ok: false, reason: 'revoked' };
    }
    const current = await this.currentCookie(manager, row);
    if (!current) return { ok: false, reason: 'revoked' };
    if ('expired' in current) return { ok: false, reason: 'expired' };
    return {
      ok: true,
      userId: current.userId,
      refreshToken: current.raw,
    };
  }

  /**
   * Follow sealed successors to the one live, unrotated cookie. A missing
   * seal does not revoke the family: the tab that won the race still holds it.
   */
  private async currentCookie(
    manager: EntityManager,
    start: SessionRow,
  ): Promise<{ userId: number; raw: string } | { expired: true } | null> {
    let cursor = start;
    const seen = new Set<string>();
    const secret = this.sealSecret();
    for (let hop = 0; hop < MAX_SEAL_HOPS; hop += 1) {
      if (!cursor.successorSeal || seen.has(cursor.tokenHash)) return null;
      seen.add(cursor.tokenHash);
      const raw = openRefreshSeal(cursor.successorSeal, secret);
      if (!raw) return null;
      const next = await lockByHash(manager, raw);
      if (!next || next.familyId !== cursor.familyId || next.revokedAt) {
        return null;
      }
      if (!next.rotatedAt) {
        if (!(await tokenIsLive(manager, next.id))) return { expired: true };
        return { userId: Number(next.userId), raw };
      }
      cursor = next;
    }
    return null;
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE "refresh_tokens"
       SET "revokedAt" = NOW(), "successorSeal" = NULL
       WHERE "familyId" = $1 AND "revokedAt" IS NULL`,
      [familyId],
    );
  }

  private sealSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET')?.trim();
    if (!secret) throw new Error('JWT_SECRET is not defined');
    return secret;
  }

  private async clearStaleSeals(): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE "refresh_tokens"
         SET "successorSeal" = NULL
         WHERE "successorSeal" IS NOT NULL
           AND (
             "revokedAt" IS NOT NULL
             OR "rotatedAt" < NOW() - ($1::int * INTERVAL '1 second')
           )`,
        [REFRESH_REUSE_GRACE_SEC],
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Could not clear old refresh seals: ${detail}`);
    }
  }

  private async prune(db: DataSource | EntityManager): Promise<void> {
    try {
      await this.clearStaleSeals();
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
      `SELECT "id", "userId", "familyId", "tokenHash", "successorSeal",
              "expiresAt", "rotatedAt", "revokedAt"
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

async function rotatedWithinGrace(
  manager: EntityManager,
  id: number,
): Promise<boolean> {
  const rows = rowsFromQuery<{ withinGrace: boolean | string | null }>(
    await manager.query(
      `SELECT ("rotatedAt" > NOW() - ($2::int * INTERVAL '1 second')) AS "withinGrace"
       FROM "refresh_tokens"
       WHERE "id" = $1`,
      [id, REFRESH_REUSE_GRACE_SEC],
    ),
  );
  return rows[0]?.withinGrace === true;
}

async function tokenIsLive(
  manager: EntityManager,
  id: number,
): Promise<boolean> {
  const rows = rowsFromQuery<{ live: boolean | string | null }>(
    await manager.query(
      `SELECT ("expiresAt" > NOW()) AS "live"
       FROM "refresh_tokens"
       WHERE "id" = $1`,
      [id],
    ),
  );
  return rows[0]?.live === true;
}

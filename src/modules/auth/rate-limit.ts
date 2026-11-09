import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RATE_LIMIT_ACCOUNT,
  DEFAULT_RATE_LIMIT_IP,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MESSAGE,
} from './account.constants';

export class RateLimitError extends Error {
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super(RATE_LIMIT_MESSAGE);
    this.retryAfterSec = retryAfterSec;
  }
}

type ConsumeResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

/**
 * Process-local sliding window. One Railway instance is enough for launch;
 * a second instance would not share these counters.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(key: string, limit: number, windowMs: number): ConsumeResult {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (stamp) => stamp > now - windowMs,
    );
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const retryAfterSec = Math.max(
        1,
        Math.ceil((recent[0] + windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  clear(): void {
    this.hits.clear();
  }
}

export function readPositiveInt(
  value: string | number | undefined,
  fallback: number,
): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export type RateLimitBucket = 'password_reset' | 'email_resend';

@Injectable()
export class AuthRateLimiter {
  private readonly windows = new SlidingWindowRateLimiter();

  constructor(private readonly config: ConfigService) {}

  assert(bucket: RateLimitBucket, email: string, ip: string): void {
    const windowMs = readPositiveInt(
      this.config.get<string | number>('AUTH_RATE_LIMIT_WINDOW_MS'),
      DEFAULT_RATE_LIMIT_WINDOW_MS,
    );
    const accountLimit = readPositiveInt(
      this.config.get<string | number>('AUTH_RATE_LIMIT_ACCOUNT'),
      DEFAULT_RATE_LIMIT_ACCOUNT,
    );
    const ipLimit = readPositiveInt(
      this.config.get<string | number>('AUTH_RATE_LIMIT_IP'),
      DEFAULT_RATE_LIMIT_IP,
    );
    const account = this.windows.consume(
      `${bucket}:email:${email}`,
      accountLimit,
      windowMs,
    );
    const network = this.windows.consume(
      `${bucket}:ip:${normalizeIp(ip)}`,
      ipLimit,
      windowMs,
    );
    if (!account.allowed || !network.allowed) {
      const accountWait = account.allowed ? 0 : account.retryAfterSec;
      const ipWait = network.allowed ? 0 : network.retryAfterSec;
      throw new RateLimitError(Math.max(accountWait, ipWait, 1));
    }
  }

  clear(): void {
    this.windows.clear();
  }
}

export function normalizeIp(ip: string | undefined): string {
  const trimmed = (ip ?? '').trim();
  if (!trimmed) return 'unknown';
  return trimmed.startsWith('::ffff:')
    ? trimmed.slice('::ffff:'.length)
    : trimmed;
}

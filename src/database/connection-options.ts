import type { DataSourceOptions } from 'typeorm';

/** Env shape for CLI (process.env) and Nest (mapped from ConfigService). */
export type DbEnv = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_SSL?: string;
  RUNNING_IN_DOCKER?: string;
  NODE_ENV?: string;
};

/**
 * Fail fast with a clear message when DATABASE_URL is truncated, placeholder,
 * or broken by an unescaped @ in the password (DNS then tries hostname "base" etc.).
 */
function validatePostgresConnectionUrl(urlRaw: string): void {
  const urlString = urlRaw.trim();
  if (!urlString) {
    throw new Error('DATABASE_URL is empty.');
  }
  if (!/^postgres(ql)?:\/\//i.test(urlString)) {
    throw new Error(
      'DATABASE_URL must be a full URL starting with postgres:// or postgresql:// (check your .env; no quotes needed).',
    );
  }
  let hostname: string;
  try {
    hostname = new URL(urlString).hostname;
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL. If your DB password contains @, #, or %, URL-encode it (e.g. @ → %40) or use discrete DB_* variables instead.',
    );
  }
  if (!hostname) {
    throw new Error(
      'DATABASE_URL is missing a host after @. Paste the full External Database URL from Render (or your provider) with no line breaks.',
    );
  }
  if (hostname === 'base') {
    throw new Error(
      `DATABASE_URL resolves to host "${hostname}", which is invalid. Usually the URL was cut off, a placeholder was left in .env, or an @ in the password broke the string — fix the URL or encode special characters in the password.`,
    );
  }
}

/**
 * Shared connection settings so runtime Nest and migration CLI stay aligned.
 */
export function getPostgresConnectionCore(env: DbEnv): DataSourceOptions {
  const useUrl = !!env.DATABASE_URL?.trim();
  const runningInDocker = env.RUNNING_IN_DOCKER === 'true';
  const resolvedHost = runningInDocker ? 'db' : 'localhost';
  const enableSSL = env.DB_SSL === 'true';

  const base: DataSourceOptions = {
    type: 'postgres',
    synchronize: false,
    logging: env.NODE_ENV !== 'production',
    ssl: enableSSL ? { rejectUnauthorized: false } : false,
  };

  if (useUrl) {
    validatePostgresConnectionUrl(env.DATABASE_URL!);
    return { ...base, url: env.DATABASE_URL!.trim() };
  }

  const host = env.DB_HOST || resolvedHost;
  if (host === 'base' || host.length < 2) {
    throw new Error(
      `DB_HOST is set to "${host}", which is invalid. Use localhost, db (Docker), or your cloud hostname — or set DATABASE_URL instead.`,
    );
  }

  return {
    ...base,
    host: env.DB_HOST || resolvedHost,
    port: parseInt(env.DB_PORT || '5432', 10),
    username: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || 'password',
    database: env.DB_NAME || 'ai_notes',
  };
}

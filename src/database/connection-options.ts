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
 * Shared connection settings so runtime Nest and migration CLI stay aligned.
 */
export function getPostgresConnectionCore(env: DbEnv): DataSourceOptions {
  const useUrl = !!env.DATABASE_URL;
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
    return { ...base, url: env.DATABASE_URL };
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

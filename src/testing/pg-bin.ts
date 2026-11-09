import { existsSync } from 'fs';
import { dirname } from 'path';
import { execFileSync } from 'child_process';

const PACKAGED = ['17', '16', '15', '14'].map(
  (version) => `/usr/lib/postgresql/${version}/bin`,
);

/**
 * Directory that contains initdb and pg_ctl.
 * `PG_BIN_DIR` wins when it points at a real install; otherwise the usual
 * Debian/Ubuntu paths, then whatever `initdb` is on PATH.
 */
export function pgBinDir(): string {
  return resolvePgBinDir(process.env, existsSync, pathOfInitdb);
}

export function resolvePgBinDir(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  whichInitdb: () => string | undefined = () => undefined,
): string {
  const configured = env.PG_BIN_DIR?.trim();
  if (configured && exists(`${configured}/initdb`)) return configured;

  for (const dir of PACKAGED) {
    if (exists(`${dir}/initdb`)) return dir;
  }

  const fromPath = whichInitdb();
  if (fromPath && exists(fromPath)) return dirname(fromPath);
  throw new Error(
    'Postgres binaries not found. Set PG_BIN_DIR to the directory that contains initdb.',
  );
}

function pathOfInitdb(): string | undefined {
  try {
    const found = execFileSync('which', ['initdb'], {
      encoding: 'utf8',
    }).trim();
    return found || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Preview deployments of this frontend on this Vercel team.
 * The middle segment is the slug Vercel inserts (branch or deployment id).
 * Anchored so a look-alike host, another Vercel project, or http cannot match.
 */
export const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/prysmic-frontend-[a-z0-9-]+-v4runa-9390s-projects\.vercel\.app$/;

/** Configured origins, local dev, and this project's Vercel previews. */
export function corsOrigins(
  frontendUrl: string | undefined,
): Array<string | RegExp> {
  const configured = frontendUrl
    ? frontendUrl
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    : [];
  return [...configured, 'http://localhost:3000', VERCEL_PREVIEW_ORIGIN];
}

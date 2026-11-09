/**
 * Access tokens carry `sv`. It starts at 0, including tokens issued before
 * this claim existed. A password reset increments the user's sessionVersion,
 * so older tokens stop matching without a denylist or a secret rotation.
 */
export function sessionVersionMatches(
  current: unknown,
  presented: unknown,
): boolean {
  const expected = normalizeVersion(current);
  const got =
    presented === undefined || presented === null
      ? 0
      : normalizeVersion(presented);
  if (expected === null || got === null) return false;
  return expected === got;
}

function normalizeVersion(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

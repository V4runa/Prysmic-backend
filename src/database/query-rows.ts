/**
 * TypeORM's Postgres driver returns SELECT rows directly, and
 * `UPDATE/DELETE ... RETURNING` as `[rows, rowCount]`.
 */
export function rowsFromQuery<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  if (Array.isArray(result)) return result as T[];
  return [];
}

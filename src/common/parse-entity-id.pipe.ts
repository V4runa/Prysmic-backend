import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PipeTransform,
} from '@nestjs/common';

/**
 * Postgres `integer` / `serial` primary keys. Values outside this range are
 * rejected by the server (SQLSTATE 22003) and Nest reports that as a 500.
 */
const PG_INT_MIN = -2147483648;
const PG_INT_MAX = 2147483647;

/**
 * Same body ParseIntPipe returns for a bad query value, so `?tagId=nope`
 * stays a 400.
 */
const NUMERIC_STRING_EXPECTED =
  'Validation failed (numeric string is expected)';

/**
 * Turn a route or query id into an int4, or undefined when it is not one.
 *
 * The global ValidationPipe runs first and coerces numeric params with
 * unary plus (`+"abc"` is NaN, `+"1.5"` is 1.5, a huge digit string stays a
 * number). Those used to reach TypeORM, and Postgres answered with a 500.
 * Strings are accepted too, so the result does not depend on that coercion.
 *
 * Integers inside the int4 range are returned as-is, including ones no row
 * uses. The service then answers with its own not-found body.
 */
export function parseEntityId(value: unknown): number | undefined {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isInteger(numeric)) {
    return undefined;
  }
  if (numeric < PG_INT_MIN || numeric > PG_INT_MAX) return undefined;
  return numeric;
}

/** Path id. A broken link is a 404, never a validation 400 or a server 500. */
@Injectable()
export class ParseEntityIdPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    const id = parseEntityId(value);
    if (id === undefined) throw new NotFoundException('Not found');
    return id;
  }
}

/**
 * Optional query id, such as `?tagId=`. Absent stays absent. A present value
 * that is not an int4 is a 400, which keeps it out of the SQL parameter.
 */
@Injectable()
export class ParseOptionalEntityIdPipe
  implements PipeTransform<unknown, number | undefined>
{
  transform(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const id = parseEntityId(value);
    if (id === undefined) {
      throw new BadRequestException(NUMERIC_STRING_EXPECTED);
    }
    return id;
  }
}

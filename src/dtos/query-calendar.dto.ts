import { IsOptional, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IANA_TZ = /^[A-Za-z0-9_+-]{1,32}(?:\/[A-Za-z0-9_+-]{1,32}){0,2}$/;

/**
 * Inclusive local-day window for the aggregation feed. Both bounds are optional;
 * the service falls back to the current calendar month when omitted.
 */
export class QueryCalendarDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  /** IANA zone for the viewer's local calendar day. Omitted keeps UTC. */
  @IsOptional()
  @Matches(IANA_TZ, { message: 'tz must be an IANA time zone name' })
  tz?: string;
}

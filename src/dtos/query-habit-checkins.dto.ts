import { IsDefined, IsString, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inclusive calendar window for one contract's kept days. Both bounds are
 * required. The service rejects impossible dates, reversed bounds, and a
 * span longer than 62 days.
 */
export class QueryHabitCheckinsDto {
  @IsDefined({ message: 'from is required' })
  @IsString()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from: string;

  @IsDefined({ message: 'to is required' })
  @IsString()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to: string;
}

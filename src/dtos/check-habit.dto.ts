import { IsOptional, IsString, Matches } from 'class-validator';

export class CheckHabitDto {
  // The client's local calendar date (YYYY-MM-DD) so the streak day boundary
  // matches the user's timezone rather than the server's UTC clock.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}

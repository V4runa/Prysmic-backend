// src/dtos/create-mood.dto.ts

import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateMoodDto {
  // The chosen mood's label (a default like "Joyful" or a user-created mood).
  // No longer restricted to a fixed list now that moods are customizable.
  @IsString()
  @IsNotEmpty()
  @MaxLength(40, { message: 'Mood name must be 40 characters or fewer.' })
  moodType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16, { message: 'Emoji must be 16 characters or fewer.' })
  emoji: string;

  // Palette color token snapshot (e.g. "amber"). Optional for resilience with
  // older clients; the UI falls back to a default color when absent.
  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280, { message: 'Note must be 280 characters or fewer.' })
  note?: string;

  // The client's local calendar date (YYYY-MM-DD) so "today" buckets by the
  // user's timezone. Falls back to the server day when absent.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}

// src/dtos/create-mood.dto.ts

import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';

export const ALLOWED_MOOD_TYPES = [
  'joyful', 'calm', 'focused', 'tired', 'anxious',
  'inspired', 'grateful', 'lonely', 'angry', 'hopeful',
] as const;

export class CreateMoodDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MOOD_TYPES as unknown as string[], { message: 'Invalid moodType' })
  moodType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10, { message: 'Emoji must be 10 characters or fewer.' })
  emoji: string;

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

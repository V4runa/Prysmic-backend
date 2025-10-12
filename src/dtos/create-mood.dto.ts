// src/dtos/create-mood.dto.ts

import { IsString, IsNotEmpty, MaxLength, IsIn, IsOptional } from 'class-validator';

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
}

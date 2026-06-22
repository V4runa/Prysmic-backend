// src/dtos/create-mood-option.dto.ts

import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMoodOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40, { message: 'Mood name must be 40 characters or fewer.' })
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16, { message: 'Emoji must be 16 characters or fewer.' })
  emoji: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  color: string;
}

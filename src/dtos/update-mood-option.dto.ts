// src/dtos/update-mood-option.dto.ts

import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class UpdateMoodOptionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40, { message: 'Mood name must be 40 characters or fewer.' })
  label?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16, { message: 'Emoji must be 16 characters or fewer.' })
  emoji?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  color?: string;
}

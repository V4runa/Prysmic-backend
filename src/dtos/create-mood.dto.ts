// src/dtos/create-mood.dto.ts

import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMoodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10, { message: 'Emoji must be 10 characters or fewer.' })
  emoji: string;
}

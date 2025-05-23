import { IsEnum, IsOptional, IsString } from 'class-validator';
import { HabitFrequency } from '../enums/habit-frequency.enum';

export class CreateHabitDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  affirmation?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(HabitFrequency)
  frequency?: HabitFrequency;
}

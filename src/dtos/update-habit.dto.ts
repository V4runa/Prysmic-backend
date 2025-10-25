import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { HabitFrequency } from '../enums/habit-frequency.enum';

export class UpdateHabitDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

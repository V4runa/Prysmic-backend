import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
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

  /**
   * Note this contract was created from. Optional. The service checks that the
   * note belongs to the caller; a missing note and someone else's note fail
   * the same way. Omitted means the habit has no source note.
   */
  @IsOptional()
  @IsInt()
  originNoteId?: number;
}

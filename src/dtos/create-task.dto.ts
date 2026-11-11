import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsNumber,
  IsArray,
  IsInt,
} from 'class-validator';
import { TaskPriority } from '../modules/tasks/tasks.entity';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tagIds?: number[];

  /**
   * Note this task was created from. Optional. The service checks that the
   * note belongs to the caller; a missing note and someone else's note fail
   * the same way. Omitted means the task has no source note.
   */
  @IsOptional()
  @IsInt()
  originNoteId?: number;
}

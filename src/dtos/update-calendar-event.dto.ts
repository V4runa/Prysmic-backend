import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CalendarRecurrence } from '../enums/calendar-recurrence.enum';
import { CalendarLinkType } from '../enums/calendar-link-type.enum';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Hand-written (rather than PartialType) to match the codebase convention and
 * to keep `null` semantics explicit: passing `null` for an optional field
 * clears it (e.g. removing an end date, time, recurrence end, or link).
 */
export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string | null;

  @IsOptional()
  @Matches(CLOCK_TIME, { message: 'startTime must be HH:MM or HH:MM:SS' })
  startTime?: string | null;

  @IsOptional()
  @Matches(CLOCK_TIME, { message: 'endTime must be HH:MM or HH:MM:SS' })
  endTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @IsOptional()
  @IsEnum(CalendarRecurrence)
  recurrence?: CalendarRecurrence;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'recurrenceEndDate must be YYYY-MM-DD' })
  recurrenceEndDate?: string | null;

  @IsOptional()
  @IsEnum(CalendarLinkType)
  linkedType?: CalendarLinkType | null;

  @IsOptional()
  @IsInt()
  linkedId?: number | null;
}

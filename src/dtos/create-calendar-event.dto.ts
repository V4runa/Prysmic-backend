import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CalendarRecurrence } from '../enums/calendar-recurrence.enum';
import { CalendarLinkType } from '../enums/calendar-link-type.enum';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateCalendarEventDto {
  @IsString()
  @MaxLength(140)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @Matches(ISO_DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  // Times are only meaningful for timed (non all-day) events.
  @ValidateIf((o) => o.allDay === false)
  @IsOptional()
  @Matches(CLOCK_TIME, { message: 'startTime must be HH:MM or HH:MM:SS' })
  startTime?: string;

  @ValidateIf((o) => o.allDay === false)
  @IsOptional()
  @Matches(CLOCK_TIME, { message: 'endTime must be HH:MM or HH:MM:SS' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsEnum(CalendarRecurrence)
  recurrence?: CalendarRecurrence;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'recurrenceEndDate must be YYYY-MM-DD' })
  recurrenceEndDate?: string;

  @IsOptional()
  @IsEnum(CalendarLinkType)
  linkedType?: CalendarLinkType;

  @IsOptional()
  @IsInt()
  linkedId?: number;
}

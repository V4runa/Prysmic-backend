import { CalendarLinkType } from '../../enums/calendar-link-type.enum';
import { CalendarRecurrence } from '../../enums/calendar-recurrence.enum';

/**
 * Normalised, source-tagged items returned by the aggregation feed.
 *
 * Placement philosophy: each item carries its own native date/timestamp and the
 * client buckets it onto the grid using the user's local timezone (matching how
 * the rest of Prysmic computes "local day"). The backend never pre-buckets
 * timestamp-based items, so day placement always matches what the user sees in
 * the source module.
 */

export type CalendarItemSource = 'event' | 'task' | 'habit' | 'mood' | 'note';

export interface CalendarLinkRef {
  type: CalendarLinkType;
  id: number;
  title: string;
}

/** One concrete (already recurrence-expanded) instance of a native event. */
export interface CalendarEventItem {
  source: 'event';
  /** Stable per-instance key (baseId + occurrence date) for React lists. */
  key: string;
  /** The underlying event row id (shared across all occurrences of a series). */
  id: number;
  title: string;
  description?: string | null;
  color: string;
  location?: string | null;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  recurrence: CalendarRecurrence;
  isRecurringInstance: boolean;
  linked?: CalendarLinkRef;
}

export interface CalendarTaskItem {
  source: 'task';
  id: number;
  title: string;
  priority: number;
  isComplete: boolean;
  dueDate: string; // ISO timestamp
}

export interface CalendarHabitItem {
  source: 'habit';
  /** Unique per habit+day so React keys stay stable. */
  key: string;
  id: number;
  title: string;
  color: string;
  icon?: string | null;
  date: string; // YYYY-MM-DD (local)
  /** True when this day is an expected occurrence (daily habits). */
  expected: boolean;
  checked: boolean;
}

export interface CalendarMoodItem {
  source: 'mood';
  id: number;
  moodType: string;
  emoji: string;
  color?: string | null;
  date: string; // YYYY-MM-DD (local)
}

export interface CalendarNoteItem {
  source: 'note';
  id: number;
  title: string;
  createdAt: string; // ISO timestamp
}

export type CalendarItem =
  | CalendarEventItem
  | CalendarTaskItem
  | CalendarHabitItem
  | CalendarMoodItem
  | CalendarNoteItem;

export interface CalendarFeed {
  from: string;
  to: string;
  items: CalendarItem[];
}

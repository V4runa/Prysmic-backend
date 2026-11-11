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
 *
 * Tasks are the exception that can belong to two local days (the due day and
 * the day they were finished). The feed still returns one object per task.
 * `calendarReason` tells the client which of those days fall in this window;
 * the client drops the second chip when both instants land on the same local
 * day. The backend cannot do that collapse itself: it does not know the
 * timezone, and a second row with the same id would render twice on the
 * current calendar (it places every task with `taskDueDayKey(dueDate)` and
 * keys the row by task id).
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

/**
 * Why a task row is in this window.
 *
 * - `due`: the due timestamp falls in the widened window. Place it on the due
 *   day only. `completedAt` is context (the task may already be done on a day
 *   outside this window, or the completion time was never stored).
 * - `completed`: the completion timestamp falls in the window and the due
 *   timestamp does not. Place it on the completion day only, using the same
 *   local-day rule as notes (`localDateKey(completedAt)`), not `taskDueDayKey`.
 * - `both`: both timestamps fall in the window. Place it on the due day and,
 *   when the completion's local day is different, also on that day. One chip
 *   per local day.
 */
export type CalendarTaskReason = 'due' | 'completed' | 'both';

export interface CalendarTaskItem {
  source: 'task';
  id: number;
  title: string;
  priority: number;
  isComplete: boolean;
  /**
   * Due timestamp (ISO) when the task has one.
   *
   * Always a string, including for tasks that were completed with no due date.
   * In that case it repeats `completedAt` so the current client, which places
   * every task with `taskDueDayKey(dueDate)`, shows the task on the day it was
   * finished instead of the Unix epoch (`taskDueDayKey(null)`). Tell those
   * apart with `calendarReason === 'completed' && dueDate === completedAt`.
   *
   * A `completed` row whose `dueDate` differs from `completedAt` has a real due
   * date outside this request's window. Do not also draw that due day from
   * this response; it shows up when a window that contains it is requested.
   */
  dueDate: string;
  /**
   * When the task was marked complete. Null when it is still open, or when it
   * is complete but no completion time was stored. Missing times are not
   * backfilled.
   */
  completedAt: string | null;
  calendarReason: CalendarTaskReason;
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
  note?: string | null;
  date: string; // YYYY-MM-DD (local)
  /** Added retroactively; shown on the grid but excluded from streak counts. */
  backfilled: boolean;
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

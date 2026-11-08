import { CalendarLinkType } from '../../enums/calendar-link-type.enum';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Task } from '../tasks/tasks.entity';
import { noteHtmlToText } from './export.text';
import type {
  ExportAttachment,
  ExportCalendarEvent,
  ExportCalendarLink,
  ExportHabit,
  ExportHabitCheck,
  ExportMood,
  ExportMoodOption,
  ExportNote,
  ExportTag,
  ExportTask,
} from './export.types';

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString();
}

export function toDateOnly(
  value: string | Date | null | undefined,
): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function toTime(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return value.length >= 8 ? value.slice(0, 8) : value;
}

function textOrNull(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return value;
}

export function serializeTag(tag: Tag): ExportTag {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color ?? null,
  };
}

export function serializeAttachment(row: NoteAttachment): ExportAttachment {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: toIso(row.createdAt) ?? '',
    bytesIncluded: false,
  };
}

export function serializeNote(
  note: Note,
  tagIds: number[],
  attachments: ExportAttachment[],
): ExportNote {
  const contentHtml = note.content ?? '';
  return {
    id: note.id,
    title: note.title,
    contentHtml,
    contentText: noteHtmlToText(contentHtml),
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    createdAt: toIso(note.createdAt) ?? '',
    updatedAt: toIso(note.updatedAt) ?? '',
    tagIds,
    attachments,
  };
}

export function serializeTask(task: Task, tagIds: number[]): ExportTask {
  return {
    id: task.id,
    title: task.title,
    description: textOrNull(task.description),
    isComplete: task.isComplete,
    isArchived: task.isArchived,
    priority: Number(task.priority),
    dueDate: toIso(task.dueDate),
    completedAt: toIso(task.completedAt),
    archivedAt: toIso(task.archivedAt),
    createdAt: toIso(task.createdAt) ?? '',
    updatedAt: toIso(task.updatedAt) ?? '',
    tagIds,
  };
}

export function serializeHabitCheck(check: HabitCheck): ExportHabitCheck {
  return {
    id: check.id,
    date: toDateOnly(check.date) ?? '',
    createdAt: toIso(check.createdAt) ?? '',
  };
}

export function serializeHabit(
  habit: Habit,
  originNoteId: number | null,
  checks: ExportHabitCheck[],
): ExportHabit {
  return {
    id: habit.id,
    name: habit.name,
    description: textOrNull(habit.description),
    intent: textOrNull(habit.intent),
    affirmation: textOrNull(habit.affirmation),
    color: habit.color,
    icon: textOrNull(habit.icon),
    frequency: habit.frequency,
    isActive: habit.isActive,
    originNoteId,
    createdAt: toIso(habit.createdAt) ?? '',
    updatedAt: toIso(habit.updatedAt) ?? '',
    checks,
  };
}

export function serializeMoodOption(option: MoodOption): ExportMoodOption {
  return {
    id: option.id,
    label: option.label,
    emoji: option.emoji,
    color: option.color,
    sortOrder: option.sortOrder,
    createdAt: toIso(option.createdAt) ?? '',
  };
}

export function serializeMood(mood: Mood): ExportMood {
  return {
    id: mood.id,
    moodType: mood.moodType,
    emoji: mood.emoji,
    color: mood.color ?? null,
    note: textOrNull(mood.note),
    date: toDateOnly(mood.date) ?? '',
    backfilled: mood.backfilled,
    createdAt: toIso(mood.createdAt) ?? '',
  };
}

export function serializeCalendarLink(
  event: CalendarEvent,
  ownedIds: { note: Set<number>; task: Set<number>; habit: Set<number> },
): ExportCalendarLink | null {
  if (event.linkedType == null || event.linkedId == null) return null;
  const id = Number(event.linkedId);
  if (!Number.isInteger(id)) return null;
  if (event.linkedType === CalendarLinkType.NOTE && ownedIds.note.has(id)) {
    return { type: 'note', id };
  }
  if (event.linkedType === CalendarLinkType.TASK && ownedIds.task.has(id)) {
    return { type: 'task', id };
  }
  if (event.linkedType === CalendarLinkType.HABIT && ownedIds.habit.has(id)) {
    return { type: 'habit', id };
  }
  return null;
}

export function serializeCalendarEvent(
  event: CalendarEvent,
  link: ExportCalendarLink | null,
): ExportCalendarEvent {
  return {
    id: event.id,
    title: event.title,
    description: textOrNull(event.description),
    allDay: event.allDay,
    startDate: toDateOnly(event.startDate) ?? '',
    endDate: toDateOnly(event.endDate),
    startTime: toTime(event.startTime),
    endTime: toTime(event.endTime),
    color: event.color,
    location: textOrNull(event.location),
    recurrence: event.recurrence,
    recurrenceEndDate: toDateOnly(event.recurrenceEndDate),
    link,
    createdAt: toIso(event.createdAt) ?? '',
    updatedAt: toIso(event.updatedAt) ?? '',
  };
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { CalendarEvent } from './calendar-event.entity';
import { Task } from '../tasks/tasks.entity';
import { Habit } from '../habits/habit.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Mood } from '../moods/mood.entity';
import { Note } from '../notes/notes.entity';
import { CreateCalendarEventDto } from '../../dtos/create-calendar-event.dto';
import { UpdateCalendarEventDto } from '../../dtos/update-calendar-event.dto';
import { CalendarRecurrence } from '../../enums/calendar-recurrence.enum';
import { CalendarLinkType } from '../../enums/calendar-link-type.enum';
import { HabitFrequency } from '../../enums/habit-frequency.enum';
import {
  CalendarEventItem,
  CalendarFeed,
  CalendarHabitItem,
  CalendarItem,
  CalendarLinkRef,
  CalendarMoodItem,
  CalendarNoteItem,
  CalendarTaskItem,
} from './calendar.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES = 1000; // safety cap for runaway recurrence expansion

// ---------------------------------------------------------------------------
// Local-day date helpers. All operate on "YYYY-MM-DD" strings anchored at UTC
// midnight so arithmetic is DST-immune; lexical comparison of these strings is
// equivalent to chronological comparison.
// ---------------------------------------------------------------------------

function parseDay(d: string): number {
  return new Date(`${d}T00:00:00.000Z`).getTime();
}

function fromEpoch(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function addDays(d: string, n: number): string {
  return fromEpoch(parseDay(d) + n * DAY_MS);
}

function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const targetIndex = m - 1 + n;
  const targetYear = y + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const daysInTarget = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, daysInTarget);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay))
    .toISOString()
    .slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
}

function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEvent)
    private eventRepo: Repository<CalendarEvent>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(Habit)
    private habitRepo: Repository<Habit>,
    @InjectRepository(HabitCheck)
    private checkRepo: Repository<HabitCheck>,
    @InjectRepository(Mood)
    private moodRepo: Repository<Mood>,
    @InjectRepository(Note)
    private noteRepo: Repository<Note>,
  ) {}

  // ----------------------------- Event CRUD -----------------------------

  private normalizeEventInput<
    T extends CreateCalendarEventDto | UpdateCalendarEventDto,
  >(dto: T): T {
    const allDay = (dto as CreateCalendarEventDto).allDay;
    // All-day events never carry times; clear them so storage stays consistent.
    if (allDay === true) {
      return { ...dto, startTime: null, endTime: null };
    }
    return dto;
  }

  async createEvent(userId: number, dto: CreateCalendarEventDto) {
    const event = this.eventRepo.create({
      ...this.normalizeEventInput(dto),
      allDay: dto.allDay ?? true,
      recurrence: dto.recurrence ?? CalendarRecurrence.NONE,
      color: dto.color ?? 'cyan',
      userId,
    });
    return this.eventRepo.save(event);
  }

  async getEvent(id: number, userId: number) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.userId !== userId) {
      throw new ForbiddenException('You do not have access to this event');
    }
    return event;
  }

  async updateEvent(id: number, userId: number, dto: UpdateCalendarEventDto) {
    const event = await this.getEvent(id, userId);
    this.eventRepo.merge(event, this.normalizeEventInput(dto));
    return this.eventRepo.save(event);
  }

  async deleteEvent(id: number, userId: number) {
    const event = await this.getEvent(id, userId);
    await this.eventRepo.remove(event);
    return { success: true };
  }

  // --------------------------- Aggregation feed ---------------------------

  private resolveRange(
    from?: string,
    to?: string,
  ): { from: string; to: string } {
    if (from && to) {
      return from <= to ? { from, to } : { from: to, to: from };
    }
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    return { from: from ?? first, to: to ?? last };
  }

  async getFeed(
    userId: number,
    fromRaw?: string,
    toRaw?: string,
  ): Promise<CalendarFeed> {
    const { from, to } = this.resolveRange(fromRaw, toRaw);

    // Timestamp-based sources are widened by a day on each side so items near
    // the window edge are still available after the client re-buckets them into
    // its local timezone.
    const tsFrom = new Date(`${addDays(from, -1)}T00:00:00.000Z`);
    const tsTo = new Date(`${addDays(to, 1)}T23:59:59.999Z`);

    const [eventItems, taskItems, habitItems, moodItems, noteItems] =
      await Promise.all([
        this.buildEventItems(userId, from, to),
        this.buildTaskItems(userId, tsFrom, tsTo),
        this.buildHabitItems(userId, from, to),
        this.buildMoodItems(userId, from, to),
        this.buildNoteItems(userId, tsFrom, tsTo),
      ]);

    const items: CalendarItem[] = [
      ...eventItems,
      ...taskItems,
      ...habitItems,
      ...moodItems,
      ...noteItems,
    ];

    return { from, to, items };
  }

  // --------------------------- Per-source builders ---------------------------

  private async buildEventItems(
    userId: number,
    from: string,
    to: string,
  ): Promise<CalendarEventItem[]> {
    // Recurring series can't be range-filtered by a single date column, so we
    // pull (a) any non-recurring event overlapping the window and (b) every
    // recurring series that started on/before the window end and hasn't ended
    // before the window start, then expand in memory.
    const events = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId })
      .andWhere(
        `((e.recurrence = :none AND e.startDate <= :to AND COALESCE(e.endDate, e.startDate) >= :from)
          OR (e.recurrence != :none AND e.startDate <= :to AND (e.recurrenceEndDate IS NULL OR e.recurrenceEndDate >= :from)))`,
        { none: CalendarRecurrence.NONE, from, to },
      )
      .getMany();

    const links = await this.resolveLinks(userId, events);

    const items: CalendarEventItem[] = [];
    for (const event of events) {
      const linked = this.linkRefFor(event, links);
      for (const occ of this.expandEvent(event, from, to)) {
        items.push({
          source: 'event',
          key: `event-${event.id}-${occ.startDate}`,
          id: event.id,
          title: event.title,
          description: event.description ?? null,
          color: event.color,
          location: event.location ?? null,
          allDay: event.allDay,
          startDate: occ.startDate,
          endDate: occ.endDate,
          startTime: event.startTime ?? null,
          endTime: event.endTime ?? null,
          recurrence: event.recurrence,
          isRecurringInstance: event.recurrence !== CalendarRecurrence.NONE,
          ...(linked ? { linked } : {}),
        });
      }
    }
    return items;
  }

  /** Expand a stored event into concrete occurrences intersecting [from, to]. */
  private expandEvent(
    event: CalendarEvent,
    from: string,
    to: string,
  ): { startDate: string; endDate: string }[] {
    const duration = event.endDate
      ? Math.max(0, daysBetween(event.startDate, event.endDate))
      : 0;

    const intersects = (occStart: string): { startDate: string; endDate: string } | null => {
      const occEnd = addDays(occStart, duration);
      if (occStart <= to && occEnd >= from) return { startDate: occStart, endDate: occEnd };
      return null;
    };

    if (event.recurrence === CalendarRecurrence.NONE) {
      const hit = intersects(event.startDate);
      return hit ? [hit] : [];
    }

    const hardEnd =
      event.recurrenceEndDate && event.recurrenceEndDate < to
        ? event.recurrenceEndDate
        : to;

    const step = (k: number): string => {
      switch (event.recurrence) {
        case CalendarRecurrence.DAILY:
          return addDays(event.startDate, k);
        case CalendarRecurrence.WEEKLY:
          return addDays(event.startDate, k * 7);
        case CalendarRecurrence.MONTHLY:
          return addMonths(event.startDate, k);
        default:
          return event.startDate;
      }
    };

    // Fast-forward to the first occurrence that could still touch the window,
    // so a years-old daily series doesn't iterate thousands of times.
    let kStart = 0;
    const gapDays = daysBetween(event.startDate, from) - duration;
    if (gapDays > 0) {
      if (event.recurrence === CalendarRecurrence.DAILY) {
        kStart = gapDays;
      } else if (event.recurrence === CalendarRecurrence.WEEKLY) {
        kStart = Math.floor(gapDays / 7);
      } else if (event.recurrence === CalendarRecurrence.MONTHLY) {
        kStart = Math.max(0, monthsBetween(event.startDate, from) - 1);
      }
    }

    const occurrences: { startDate: string; endDate: string }[] = [];
    for (let k = kStart; k < kStart + MAX_OCCURRENCES; k++) {
      const occStart = step(k);
      if (occStart > hardEnd) break;
      const hit = intersects(occStart);
      if (hit) occurrences.push(hit);
    }
    return occurrences;
  }

  private async buildTaskItems(
    userId: number,
    tsFrom: Date,
    tsTo: Date,
  ): Promise<CalendarTaskItem[]> {
    const tasks = await this.taskRepo.find({
      where: { userId, isArchived: false, dueDate: Between(tsFrom, tsTo) },
      select: { id: true, title: true, priority: true, isComplete: true, dueDate: true },
    });
    return tasks.map((t) => ({
      source: 'task',
      id: t.id,
      title: t.title,
      priority: t.priority,
      isComplete: t.isComplete,
      dueDate: (t.dueDate as Date).toISOString(),
    }));
  }

  private async buildHabitItems(
    userId: number,
    from: string,
    to: string,
  ): Promise<CalendarHabitItem[]> {
    const habits = await this.habitRepo.find({
      where: { userId, isActive: true },
    });
    if (habits.length === 0) return [];

    const checks = await this.checkRepo.find({
      where: { habitId: In(habits.map((h) => h.id)), date: Between(from, to) },
      select: { habitId: true, date: true },
    });

    const checkedByHabit = new Map<number, Set<string>>();
    for (const c of checks) {
      const set = checkedByHabit.get(c.habitId) ?? new Set<string>();
      set.add(c.date);
      checkedByHabit.set(c.habitId, set);
    }

    const windowDays = eachDay(from, to);
    const items: CalendarHabitItem[] = [];

    for (const habit of habits) {
      const checkedDays = checkedByHabit.get(habit.id) ?? new Set<string>();

      if (habit.frequency === HabitFrequency.DAILY) {
        // Daily habits render an expected occurrence every day (from creation
        // onward), turning the grid into a habit tracker.
        const createdDay = habit.createdAt.toISOString().slice(0, 10);
        const start = createdDay > from ? createdDay : from;
        for (const day of windowDays) {
          if (day < start) continue;
          items.push({
            source: 'habit',
            key: `habit-${habit.id}-${day}`,
            id: habit.id,
            title: habit.name,
            color: habit.color,
            icon: habit.icon ?? null,
            date: day,
            expected: true,
            checked: checkedDays.has(day),
          });
        }
      } else {
        // Weekly/monthly habits have no stored target weekday, so we honestly
        // only surface actual check-ins rather than inventing phantom days.
        for (const day of checkedDays) {
          items.push({
            source: 'habit',
            key: `habit-${habit.id}-${day}`,
            id: habit.id,
            title: habit.name,
            color: habit.color,
            icon: habit.icon ?? null,
            date: day,
            expected: false,
            checked: true,
          });
        }
      }
    }
    return items;
  }

  private async buildMoodItems(
    userId: number,
    from: string,
    to: string,
  ): Promise<CalendarMoodItem[]> {
    const moods = await this.moodRepo.find({
      where: { user: { id: userId }, date: Between(from, to) },
    });
    return moods.map((m) => ({
      source: 'mood',
      id: m.id,
      moodType: m.moodType,
      emoji: m.emoji,
      color: m.color ?? null,
      date: m.date,
    }));
  }

  private async buildNoteItems(
    userId: number,
    tsFrom: Date,
    tsTo: Date,
  ): Promise<CalendarNoteItem[]> {
    const notes = await this.noteRepo.find({
      where: { userId, isArchived: false, createdAt: Between(tsFrom, tsTo) },
      select: { id: true, title: true, createdAt: true },
    });
    return notes.map((n) => ({
      source: 'note',
      id: n.id,
      title: n.title,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  // ----------------------------- Link resolution -----------------------------

  /** Batch-resolve linked entity titles, scoped to the owner, by link type. */
  private async resolveLinks(
    userId: number,
    events: CalendarEvent[],
  ): Promise<Map<string, string>> {
    const byType: Record<CalendarLinkType, Set<number>> = {
      [CalendarLinkType.NOTE]: new Set(),
      [CalendarLinkType.TASK]: new Set(),
      [CalendarLinkType.HABIT]: new Set(),
    };
    for (const e of events) {
      if (e.linkedType && e.linkedId) byType[e.linkedType].add(e.linkedId);
    }

    const titles = new Map<string, string>();
    const key = (type: CalendarLinkType, id: number) => `${type}:${id}`;

    const noteIds = [...byType[CalendarLinkType.NOTE]];
    const taskIds = [...byType[CalendarLinkType.TASK]];
    const habitIds = [...byType[CalendarLinkType.HABIT]];

    const [notes, tasks, habits] = await Promise.all([
      noteIds.length
        ? this.noteRepo.find({
            where: { id: In(noteIds), userId },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      taskIds.length
        ? this.taskRepo.find({
            where: { id: In(taskIds), userId },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      habitIds.length
        ? this.habitRepo.find({
            where: { id: In(habitIds), userId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    for (const n of notes) titles.set(key(CalendarLinkType.NOTE, n.id), n.title);
    for (const t of tasks) titles.set(key(CalendarLinkType.TASK, t.id), t.title);
    for (const h of habits) titles.set(key(CalendarLinkType.HABIT, h.id), h.name);

    return titles;
  }

  private linkRefFor(
    event: CalendarEvent,
    titles: Map<string, string>,
  ): CalendarLinkRef | undefined {
    if (!event.linkedType || !event.linkedId) return undefined;
    const title = titles.get(`${event.linkedType}:${event.linkedId}`);
    if (!title) return undefined; // target was deleted — drop the stale link
    return { type: event.linkedType, id: event.linkedId, title };
  }
}

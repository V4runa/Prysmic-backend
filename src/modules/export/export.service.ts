import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Task } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import {
  EXPORT_FORMAT,
  EXPORT_LIMITATIONS,
  EXPORT_LIMITS,
  EXPORT_VERSION,
} from './export.constants';
import {
  serializeAttachment,
  serializeCalendarEvent,
  serializeCalendarLink,
  serializeHabit,
  serializeHabitCheck,
  serializeMood,
  serializeMoodOption,
  serializeNote,
  serializeTag,
  serializeTask,
  toIso,
} from './export.serialize';
import type { AccountExport } from './export.types';

type OwnedSets = {
  note: Set<number>;
  task: Set<number>;
  habit: Set<number>;
  tag: Set<number>;
};

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    @InjectRepository(NoteAttachment)
    private readonly attachments: Repository<NoteAttachment>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(Habit) private readonly habits: Repository<Habit>,
    @InjectRepository(HabitCheck)
    private readonly checks: Repository<HabitCheck>,
    @InjectRepository(Mood) private readonly moods: Repository<Mood>,
    @InjectRepository(MoodOption)
    private readonly moodOptions: Repository<MoodOption>,
    @InjectRepository(CalendarEvent)
    private readonly events: Repository<CalendarEvent>,
  ) {}

  async build(userId: number): Promise<AccountExport> {
    const account = await this.users.findOne({
      where: { id: userId },
      select: { id: true, username: true, email: true, createdAt: true },
    });
    if (!account) {
      throw new NotFoundException('User not found');
    }

    const owner = { userId };
    const byAccount = { user: { id: userId } };
    await Promise.all([
      this.guardCount(this.notes, owner, 'notes', EXPORT_LIMITS.notes),
      this.guardCount(this.tags, byAccount, 'tags', EXPORT_LIMITS.tags),
      this.guardCount(this.tasks, owner, 'tasks', EXPORT_LIMITS.tasks),
      this.guardCount(this.habits, owner, 'habits', EXPORT_LIMITS.habits),
      this.guardCount(this.moods, byAccount, 'moods', EXPORT_LIMITS.moods),
      this.guardCount(
        this.moodOptions,
        byAccount,
        'mood options',
        EXPORT_LIMITS.moodOptions,
      ),
      this.guardCount(
        this.events,
        owner,
        'calendar events',
        EXPORT_LIMITS.calendarEvents,
      ),
    ]);

    const [
      noteRows,
      tagRows,
      taskRows,
      habitRows,
      moodRows,
      optionRows,
      eventRows,
    ] = await Promise.all([
      this.notes.find({
        where: owner,
        relations: ['tags'],
        order: { id: 'ASC' },
      }),
      this.tags.find({
        where: byAccount,
        order: { id: 'ASC' },
      }),
      this.tasks.find({
        where: owner,
        relations: ['tags'],
        order: { id: 'ASC' },
      }),
      this.habits.find({
        where: owner,
        order: { id: 'ASC' },
      }),
      this.moods.find({
        where: byAccount,
        order: { id: 'ASC' },
      }),
      this.moodOptions.find({
        where: byAccount,
        order: { id: 'ASC' },
      }),
      this.events.find({
        where: owner,
        order: { id: 'ASC' },
      }),
    ]);

    const owned: OwnedSets = {
      note: new Set(noteRows.map((note) => note.id)),
      task: new Set(taskRows.map((task) => task.id)),
      habit: new Set(habitRows.map((habit) => habit.id)),
      tag: new Set(tagRows.map((tag) => tag.id)),
    };

    const [checkRows, attachmentRows] = await Promise.all([
      this.checksFor(owned.habit),
      this.attachmentsFor(userId, owned.note),
    ]);

    const checksByHabit = new Map<number, HabitCheck[]>();
    for (const check of checkRows) {
      const list = checksByHabit.get(check.habitId) ?? [];
      list.push(check);
      checksByHabit.set(check.habitId, list);
    }

    const attachmentsByNote = new Map<number, NoteAttachment[]>();
    for (const row of attachmentRows) {
      if (!owned.note.has(row.noteId) || row.userId !== userId) continue;
      const list = attachmentsByNote.get(row.noteId) ?? [];
      list.push(row);
      attachmentsByNote.set(row.noteId, list);
    }

    const notes = noteRows.map((note) =>
      serializeNote(
        note,
        this.ownedTagIds(note.tags, owned.tag),
        (attachmentsByNote.get(note.id) ?? []).map(serializeAttachment),
      ),
    );
    const originByHabit = await this.originNoteIds(userId, owned.note);
    const habits = habitRows.map((habit) =>
      serializeHabit(
        habit,
        originByHabit.get(habit.id) ?? null,
        (checksByHabit.get(habit.id) ?? []).map(serializeHabitCheck),
      ),
    );
    const checkCount = habits.reduce(
      (sum, habit) => sum + habit.checks.length,
      0,
    );

    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      limitations: EXPORT_LIMITATIONS,
      coverage: {
        notes: {
          included: true,
          count: notes.length,
          content: 'html-and-text',
          attachments: 'metadata-only-bytes-excluded',
        },
        tags: {
          included: true,
          count: tagRows.length,
          linkedFrom: ['notes', 'tasks'],
        },
        tasks: { included: true, count: taskRows.length },
        habits: {
          included: true,
          count: habits.length,
          checks: 'nested-on-each-habit',
        },
        habitChecks: { included: true, count: checkCount },
        moods: { included: true, count: moodRows.length },
        moodOptions: { included: true, count: optionRows.length },
        calendarEvents: { included: true, count: eventRows.length },
      },
      account: {
        id: account.id,
        username: account.username,
        email: account.email,
        createdAt: toIso(account.createdAt) ?? '',
      },
      tags: tagRows.map(serializeTag),
      notes,
      tasks: taskRows.map((task) =>
        serializeTask(task, this.ownedTagIds(task.tags, owned.tag)),
      ),
      habits,
      moodOptions: optionRows.map(serializeMoodOption),
      moods: moodRows.map(serializeMood),
      calendarEvents: eventRows.map((event) =>
        serializeCalendarEvent(event, serializeCalendarLink(event, owned)),
      ),
    };
  }

  private async guardCount(
    repo: { count: (options: { where: object }) => Promise<number> },
    where: object,
    label: string,
    max: number,
  ): Promise<void> {
    const count = await repo.count({ where });
    if (count > max) {
      throw new PayloadTooLargeException(
        `Export exceeds the ${label} limit of ${max}. No file was produced.`,
      );
    }
  }

  private guard(label: string, count: number, max: number): void {
    if (count > max) {
      throw new PayloadTooLargeException(
        `Export exceeds the ${label} limit of ${max}. No file was produced.`,
      );
    }
  }

  private ownedTagIds(
    tags: Tag[] | null | undefined,
    owned: Set<number>,
  ): number[] {
    const ids = (tags ?? []).map((tag) => tag.id).filter((id) => owned.has(id));
    return [...new Set(ids)].sort((a, b) => a - b);
  }

  private async originNoteIds(
    userId: number,
    ownedNoteIds: Set<number>,
  ): Promise<Map<number, number | null>> {
    const rows = await this.habits
      .createQueryBuilder('habit')
      .select('habit.id', 'id')
      .addSelect('habit.originNoteId', 'originNoteId')
      .where('habit.userId = :userId', { userId })
      .getRawMany<Record<string, unknown>>();

    const links = new Map<number, number | null>();
    for (const row of rows) {
      const id = this.rawNumber(row, 'id', 'habit_id');
      const origin = this.rawNumber(row, 'originNoteId', 'habit_originNoteId');
      if (id == null) continue;
      links.set(id, origin != null && ownedNoteIds.has(origin) ? origin : null);
    }
    return links;
  }

  private rawNumber(
    row: Record<string, unknown>,
    ...keys: string[]
  ): number | null {
    for (const key of keys) {
      const value = row[key];
      if (value == null || value === '') continue;
      const parsed = Number(value);
      if (Number.isInteger(parsed)) return parsed;
    }
    return null;
  }

  private async checksFor(habitIds: Set<number>): Promise<HabitCheck[]> {
    if (habitIds.size === 0) return [];
    const where = { habitId: In([...habitIds]) };
    const count = await this.checks.count({ where });
    this.guard('habit checks', count, EXPORT_LIMITS.habitChecks);
    const rows = await this.checks.find({
      where,
      order: { date: 'ASC', id: 'ASC' },
    });
    return rows.filter((row) => habitIds.has(row.habitId));
  }

  private async attachmentsFor(
    userId: number,
    noteIds: Set<number>,
  ): Promise<NoteAttachment[]> {
    if (noteIds.size === 0) return [];
    const where = { userId, noteId: In([...noteIds]) };
    const count = await this.attachments.count({ where });
    this.guard('attachments', count, EXPORT_LIMITS.attachments);
    return this.attachments.find({
      where,
      order: { id: 'ASC' },
    });
  }
}

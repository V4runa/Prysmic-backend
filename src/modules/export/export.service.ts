import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
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
  EXPORT_BUDGET,
  EXPORT_BUDGET_TOKEN,
  EXPORT_FORMAT,
  EXPORT_LIMITATIONS,
  EXPORT_PROBE,
  EXPORT_VERSION,
  type ExportBudget,
  type ExportReadProbe,
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

type Measure = { rows: number; textBytes: number };

@Injectable()
export class ExportService {
  private readonly budget: ExportBudget;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(EXPORT_BUDGET_TOKEN)
    budget?: ExportBudget,
    @Optional()
    @Inject(EXPORT_PROBE)
    private readonly probe?: ExportReadProbe,
  ) {
    this.budget = budget ?? EXPORT_BUDGET;
  }

  async build(userId: number): Promise<AccountExport> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('REPEATABLE READ');
    try {
      await queryRunner.query('SET TRANSACTION READ ONLY');
      const snapshot = await this.readSnapshot(queryRunner.manager, userId);
      await queryRunner.commitTransaction();
      return snapshot;
    } catch (error) {
      try {
        await queryRunner.rollbackTransaction();
      } catch {
        // The snapshot transaction may already be closed after a failed BEGIN.
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async readSnapshot(
    manager: EntityManager,
    userId: number,
  ): Promise<AccountExport> {
    const account = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.email', 'user.createdAt'])
      .where('user.id = :userId', { userId })
      .getOne();
    if (!account) {
      throw new NotFoundException('User not found');
    }

    const notesM = await this.measure(manager, Note, 'note', userId, [
      'title',
      'content',
    ]);
    const tagsM = await this.measure(manager, Tag, 'tag', userId, [
      'name',
      'color',
    ]);
    const tasksM = await this.measure(manager, Task, 'task', userId, [
      'title',
      'description',
    ]);
    const habitsM = await this.measure(manager, Habit, 'habit', userId, [
      'name',
      'description',
      'intent',
      'affirmation',
    ]);
    const checksM = await this.measureChecks(manager, userId);
    const moodsM = await this.measure(manager, Mood, 'mood', userId, [
      'moodType',
      'emoji',
      'note',
    ]);
    const optionsM = await this.measure(manager, MoodOption, 'option', userId, [
      'label',
      'emoji',
    ]);
    const eventsM = await this.measure(
      manager,
      CalendarEvent,
      'event',
      userId,
      ['title', 'description', 'location'],
    );
    const attachmentsM = await this.measure(
      manager,
      NoteAttachment,
      'attachment',
      userId,
      ['filename'],
    );
    const noteLinks = await this.countLinks(manager, Note, 'note', userId);
    const taskLinks = await this.countLinks(manager, Task, 'task', userId);

    this.refuseRows('notes', notesM.rows, this.budget.notes);
    this.refuseRows('tags', tagsM.rows, this.budget.tags);
    this.refuseRows('tasks', tasksM.rows, this.budget.tasks);
    this.refuseRows('habits', habitsM.rows, this.budget.habits);
    this.refuseRows('habit checks', checksM.rows, this.budget.habitChecks);
    this.refuseRows('moods', moodsM.rows, this.budget.moods);
    this.refuseRows('mood options', optionsM.rows, this.budget.moodOptions);
    this.refuseRows(
      'calendar events',
      eventsM.rows,
      this.budget.calendarEvents,
    );
    this.refuseRows('attachments', attachmentsM.rows, this.budget.attachments);
    const linkRows = noteLinks + taskLinks;
    this.refuseRows('tag links', linkRows, this.budget.linkRows);
    const textBytes =
      notesM.textBytes +
      tagsM.textBytes +
      tasksM.textBytes +
      habitsM.textBytes +
      moodsM.textBytes +
      optionsM.textBytes +
      eventsM.textBytes +
      attachmentsM.textBytes;
    if (textBytes > this.budget.textBytes) {
      throw new PayloadTooLargeException(
        `Export exceeds the stored text limit of ${this.budget.textBytes} bytes. No file was produced.`,
      );
    }

    if (this.probe?.afterMeasures) {
      await this.probe.afterMeasures();
    }

    const noteRows = await this.loadRows(
      manager
        .getRepository(Note)
        .createQueryBuilder('note')
        .where('note.userId = :userId', { userId })
        .orderBy('note.id', 'ASC'),
      this.budget.notes,
      'notes',
    );
    const tagRows = await this.loadRows(
      manager
        .getRepository(Tag)
        .createQueryBuilder('tag')
        .where('tag.userId = :userId', { userId })
        .orderBy('tag.id', 'ASC'),
      this.budget.tags,
      'tags',
    );
    const taskRows = await this.loadRows(
      manager
        .getRepository(Task)
        .createQueryBuilder('task')
        .where('task.userId = :userId', { userId })
        .orderBy('task.id', 'ASC'),
      this.budget.tasks,
      'tasks',
    );
    const habitRows = await this.loadRows(
      manager
        .getRepository(Habit)
        .createQueryBuilder('habit')
        .where('habit.userId = :userId', { userId })
        .orderBy('habit.id', 'ASC'),
      this.budget.habits,
      'habits',
    );
    const moodRows = await this.loadRows(
      manager
        .getRepository(Mood)
        .createQueryBuilder('mood')
        .where('mood.userId = :userId', { userId })
        .orderBy('mood.id', 'ASC'),
      this.budget.moods,
      'moods',
    );
    const optionRows = await this.loadRows(
      manager
        .getRepository(MoodOption)
        .createQueryBuilder('option')
        .where('option.userId = :userId', { userId })
        .orderBy('option.id', 'ASC'),
      this.budget.moodOptions,
      'mood options',
    );
    const eventRows = await this.loadRows(
      manager
        .getRepository(CalendarEvent)
        .createQueryBuilder('event')
        .where('event.userId = :userId', { userId })
        .orderBy('event.id', 'ASC'),
      this.budget.calendarEvents,
      'calendar events',
    );

    const ownedNotes = new Set(noteRows.map((note) => note.id));
    const ownedTasks = new Set(taskRows.map((task) => task.id));
    const ownedHabits = new Set(habitRows.map((habit) => habit.id));
    const ownedTags = new Set(tagRows.map((tag) => tag.id));

    const [noteTagIds, taskTagIds, originByHabit, checkRows, attachmentRows] =
      await Promise.all([
        this.loadLinks(manager, Note, 'note', userId, ownedTags),
        this.loadLinks(manager, Task, 'task', userId, ownedTags),
        this.originNoteIds(manager, userId, ownedNotes),
        this.checksFor(manager, userId),
        this.attachmentsFor(manager, userId, ownedNotes),
      ]);

    const checksByHabit = new Map<number, HabitCheck[]>();
    for (const check of checkRows) {
      if (!ownedHabits.has(check.habitId)) continue;
      const list = checksByHabit.get(check.habitId) ?? [];
      list.push(check);
      checksByHabit.set(check.habitId, list);
    }

    const notes = noteRows.map((note) =>
      serializeNote(
        note,
        noteTagIds.get(note.id) ?? [],
        (attachmentRows.get(note.id) ?? []).map(serializeAttachment),
      ),
    );
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
        serializeTask(task, taskTagIds.get(task.id) ?? []),
      ),
      habits,
      moodOptions: optionRows.map(serializeMoodOption),
      moods: moodRows.map(serializeMood),
      calendarEvents: eventRows.map((event) =>
        serializeCalendarEvent(
          event,
          serializeCalendarLink(event, {
            note: ownedNotes,
            task: ownedTasks,
            habit: ownedHabits,
          }),
        ),
      ),
    };
  }

  private refuseRows(label: string, count: number, max: number): void {
    if (count > max) {
      throw new PayloadTooLargeException(
        `Export exceeds the ${label} limit of ${max}. No file was produced.`,
      );
    }
  }

  private async measure(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    alias: string,
    userId: number,
    textColumns: string[],
  ): Promise<Measure> {
    const sum =
      textColumns.length === 0
        ? '0'
        : textColumns
            .map((column) => `COALESCE(OCTET_LENGTH(${alias}.${column}), 0)`)
            .join(' + ');
    const raw = await manager
      .getRepository(entity)
      .createQueryBuilder(alias)
      .select('COUNT(*)', 'rows')
      .addSelect(`COALESCE(SUM(${sum}), 0)`, 'textBytes')
      .where(`${alias}.userId = :userId`, { userId })
      .getRawOne<Record<string, unknown>>();
    return {
      rows: this.rawNumber(raw, 'rows') ?? 0,
      textBytes: this.rawNumber(raw, 'textBytes') ?? 0,
    };
  }

  private async measureChecks(
    manager: EntityManager,
    userId: number,
  ): Promise<Measure> {
    const raw = await manager
      .getRepository(HabitCheck)
      .createQueryBuilder('check')
      .innerJoin('check.habit', 'habit')
      .select('COUNT(*)', 'rows')
      .addSelect('0', 'textBytes')
      .where('habit.userId = :userId', { userId })
      .getRawOne<Record<string, unknown>>();
    return {
      rows: this.rawNumber(raw, 'rows') ?? 0,
      textBytes: 0,
    };
  }

  private async countLinks(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    alias: string,
    userId: number,
  ): Promise<number> {
    return manager
      .getRepository(entity)
      .createQueryBuilder(alias)
      .innerJoin(`${alias}.tags`, 'tag')
      .where(`${alias}.userId = :userId`, { userId })
      .andWhere('tag.userId = :userId', { userId })
      .getCount();
  }

  private async loadRows<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    max: number,
    label: string,
  ): Promise<T[]> {
    const rows = await qb.limit(max + 1).getMany();
    if (rows.length > max) {
      this.refuseRows(label, rows.length, max);
    }
    return rows;
  }

  private async loadLinks(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    alias: string,
    userId: number,
    ownedTags: Set<number>,
  ): Promise<Map<number, number[]>> {
    const idKey = alias === 'task' ? 'taskId' : 'noteId';
    const rows = await manager
      .getRepository(entity)
      .createQueryBuilder(alias)
      .innerJoin(`${alias}.tags`, 'tag')
      .select(`${alias}.id`, idKey)
      .addSelect('tag.id', 'tagId')
      .where(`${alias}.userId = :userId`, { userId })
      .andWhere('tag.userId = :userId', { userId })
      .orderBy(`${alias}.id`, 'ASC')
      .addOrderBy('tag.id', 'ASC')
      .limit(this.budget.linkRows + 1)
      .getRawMany<Record<string, unknown>>();
    if (rows.length > this.budget.linkRows) {
      this.refuseRows('tag links', rows.length, this.budget.linkRows);
    }
    const links = new Map<number, number[]>();
    for (const row of rows) {
      const ownerId = this.rawNumber(row, idKey, `${alias}_id`);
      const tagId = this.rawNumber(row, 'tagId', 'tag_id');
      if (ownerId == null || tagId == null || !ownedTags.has(tagId)) continue;
      const list = links.get(ownerId) ?? [];
      list.push(tagId);
      links.set(ownerId, list);
    }
    return links;
  }

  private async originNoteIds(
    manager: EntityManager,
    userId: number,
    ownedNoteIds: Set<number>,
  ): Promise<Map<number, number | null>> {
    const rows = await manager
      .getRepository(Habit)
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

  private async checksFor(
    manager: EntityManager,
    userId: number,
  ): Promise<HabitCheck[]> {
    const rows = await manager
      .getRepository(HabitCheck)
      .createQueryBuilder('check')
      .innerJoin('check.habit', 'habit')
      .where('habit.userId = :userId', { userId })
      .orderBy('check.date', 'ASC')
      .addOrderBy('check.id', 'ASC')
      .limit(this.budget.habitChecks + 1)
      .getMany();
    if (rows.length > this.budget.habitChecks) {
      this.refuseRows('habit checks', rows.length, this.budget.habitChecks);
    }
    return rows;
  }

  private async attachmentsFor(
    manager: EntityManager,
    userId: number,
    noteIds: Set<number>,
  ): Promise<Map<number, NoteAttachment[]>> {
    const grouped = new Map<number, NoteAttachment[]>();
    if (noteIds.size === 0) return grouped;
    const rows = await manager
      .getRepository(NoteAttachment)
      .createQueryBuilder('attachment')
      .select([
        'attachment.id',
        'attachment.noteId',
        'attachment.userId',
        'attachment.filename',
        'attachment.mimeType',
        'attachment.size',
        'attachment.createdAt',
      ])
      .where('attachment.userId = :userId', { userId })
      .orderBy('attachment.id', 'ASC')
      .limit(this.budget.attachments + 1)
      .getMany();
    if (rows.length > this.budget.attachments) {
      this.refuseRows('attachments', rows.length, this.budget.attachments);
    }
    for (const row of rows) {
      if (row.userId !== userId || !noteIds.has(row.noteId)) continue;
      const list = grouped.get(row.noteId) ?? [];
      list.push(row);
      grouped.set(row.noteId, list);
    }
    return grouped;
  }

  private rawNumber(
    row: Record<string, unknown> | undefined,
    ...keys: string[]
  ): number | null {
    if (!row) return null;
    const lowered = new Map(
      Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
    );
    for (const key of keys) {
      const value = row[key] ?? lowered.get(key.toLowerCase());
      if (value == null || value === '') continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}

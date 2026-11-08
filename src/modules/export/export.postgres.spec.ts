import { Logger, DataSource } from 'typeorm';
import { CalendarLinkType } from '../../enums/calendar-link-type.enum';
import { HabitFrequency } from '../../enums/habit-frequency.enum';
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
import { EXPORT_BUDGET, type ExportBudget } from './export.constants';
import { ExportService } from './export.service';
import { spawnSync } from 'child_process';

const PG = '/usr/lib/postgresql/16/bin';
const PORT = 54346;
const DATA_DIR = '/tmp/export-gate-pg';
const HASH_A = 'synthetic-hash-pg-alpha';
const HASH_B = 'synthetic-hash-pg-beta';
const BYTE_SENTINEL = 'pg-attachment-bytes-sentinel';

class QueryLogger implements Logger {
  constructor(private readonly queries: string[]) {}
  logQuery(query: string): void {
    this.queries.push(query);
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

function budget(overrides: Partial<ExportBudget> = {}): ExportBudget {
  return { ...EXPORT_BUDGET, ...overrides };
}

describe('Account export against disposable Postgres', () => {
  let dataSource: DataSource;
  const queries: string[] = [];
  let userA: User;
  let userB: User;

  beforeAll(async () => {
    spawnSync('rm', ['-rf', DATA_DIR]);
    const init = spawnSync(
      `${PG}/initdb`,
      ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust', '--no-instructions'],
      { encoding: 'utf8' },
    );
    if (init.status !== 0) {
      throw new Error(init.stderr || init.stdout || 'initdb failed');
    }
    const start = spawnSync(`${PG}/pg_ctl`, [
      '-D',
      DATA_DIR,
      '-l',
      '/tmp/export-gate-pg.log',
      '-o',
      `-p ${PORT} -k ${DATA_DIR} -c listen_addresses=127.0.0.1`,
      'start',
    ]);
    if (start.status !== 0) {
      throw new Error('pg_ctl start failed');
    }
    spawnSync(`${PG}/createdb`, [
      '-h',
      '127.0.0.1',
      '-p',
      String(PORT),
      '-U',
      'postgres',
      'export_gate',
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: PORT,
      username: 'postgres',
      database: 'export_gate',
      synchronize: true,
      dropSchema: true,
      logging: ['query'],
      logger: new QueryLogger(queries),
      entities: [
        User,
        Note,
        NoteAttachment,
        Tag,
        Task,
        Habit,
        HabitCheck,
        Mood,
        MoodOption,
        CalendarEvent,
      ],
    });
    await dataSource.initialize();
    userA = await dataSource.getRepository(User).save({
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
      password: HASH_A,
    });
    userB = await dataSource.getRepository(User).save({
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: HASH_B,
    });
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    spawnSync(`${PG}/pg_ctl`, ['-D', DATA_DIR, 'stop']);
    spawnSync('rm', ['-rf', DATA_DIR]);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE "note_attachments", "note_tags", "task_tags", "habit_check", "habit", "task", "notes", "tags", "mood", "mood_options", "calendar_event" RESTART IDENTITY CASCADE',
    );
    queries.length = 0;
  });

  it('reads one snapshot and does not follow a concurrent commit', async () => {
    const notes = dataSource.getRepository(Note);
    const first = await notes.save({
      userId: userA.id,
      title: 'stable-one',
      content: '<p>alpha</p>',
      isPinned: false,
      isArchived: false,
    });
    await notes.save({
      userId: userA.id,
      title: 'stable-two',
      content: '<p>beta</p>',
      isPinned: false,
      isArchived: false,
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = new ExportService(dataSource, budget({ notes: 2 }), {
      afterMeasures: async () => {
        await dataSource.query(
          'UPDATE "notes" SET "title" = $1 WHERE "id" = $2',
          ['changed-after-snapshot', first.id],
        );
        await dataSource.query(
          'INSERT INTO "notes" ("title", "content", "isPinned", "isArchived", "userId") VALUES ($1, $2, false, false, $3)',
          ['racer', '<p>later</p>', userA.id],
        );
        release();
      },
    });
    const snapshotPromise = service.build(userA.id);
    await released;
    const snapshot = await snapshotPromise;
    expect(snapshot.notes.map((note) => note.title).sort()).toEqual([
      'stable-one',
      'stable-two',
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('changed-after-snapshot');
    expect(JSON.stringify(snapshot)).not.toContain('racer');
  });

  it('keeps owner rows, civil dates, and leaves attachment bytes out of SQL and JSON', async () => {
    const tags = dataSource.getRepository(Tag);
    const notes = dataSource.getRepository(Note);
    const tagA = await tags.save({
      name: 'reflections',
      color: 'cyan',
      user: userA,
    });
    const tagB = await tags.save({
      name: 'beta-tag-secret',
      color: 'rose',
      user: userB,
    });
    const noteA = await notes.save({
      userId: userA.id,
      title: 'Pond note',
      content: '<p>Hello <strong>世界</strong> &amp;amp;</p>',
      isPinned: true,
      isArchived: false,
      tags: [tagA, tagB],
    });
    const noteB = await notes.save({
      userId: userB.id,
      title: 'beta-note-secret',
      content: '<p>beta-private-secret-body</p>',
      isPinned: false,
      isArchived: false,
      tags: [tagB],
    });
    await dataSource.getRepository(NoteAttachment).save({
      noteId: noteA.id,
      userId: userA.id,
      filename: 'sketch.png',
      mimeType: 'image/png',
      size: BYTE_SENTINEL.length,
      data: Buffer.from(BYTE_SENTINEL),
    });
    await dataSource.getRepository(NoteAttachment).save({
      noteId: noteB.id,
      userId: userB.id,
      filename: 'beta-secret.pdf',
      mimeType: 'application/pdf',
      size: 4,
      data: Buffer.from('beta'),
    });
    const habitA = await dataSource.getRepository(Habit).save({
      userId: userA.id,
      name: 'Morning pages',
      color: 'cyan',
      frequency: HabitFrequency.DAILY,
      isActive: true,
      originNote: noteB,
    });
    await dataSource.getRepository(HabitCheck).save({
      habitId: habitA.id,
      date: '2026-11-01',
    });
    await dataSource.getRepository(Mood).save({
      user: userA,
      moodType: 'Grateful',
      emoji: '🕊️',
      color: 'amber',
      note: 'grateful for 星',
      date: '2026-03-08',
      backfilled: false,
    });
    await dataSource.getRepository(CalendarEvent).save({
      userId: userA.id,
      title: 'Foreign link event',
      allDay: true,
      startDate: '2026-11-01',
      color: 'cyan',
      linkedType: CalendarLinkType.NOTE,
      linkedId: noteB.id,
    });
    queries.length = 0;
    const snapshot = await new ExportService(dataSource).build(userA.id);
    expect(snapshot.notes).toHaveLength(1);
    expect(snapshot.notes[0].contentHtml).toBe(
      '<p>Hello <strong>世界</strong> &amp;amp;</p>',
    );
    expect(snapshot.notes[0].contentText).toBe('Hello 世界 &amp;');
    expect(snapshot.notes[0].tagIds).toEqual([tagA.id]);
    expect(snapshot.tags.map((tag) => tag.name)).toEqual(['reflections']);
    expect(snapshot.habits[0].originNoteId).toBeNull();
    expect(snapshot.habits[0].checks[0].date).toBe('2026-11-01');
    expect(snapshot.moods[0].date).toBe('2026-03-08');
    expect(snapshot.calendarEvents[0].startDate).toBe('2026-11-01');
    expect(snapshot.calendarEvents[0].link).toBeNull();
    expect(snapshot.notes[0].attachments[0]).toMatchObject({
      filename: 'sketch.png',
      bytesIncluded: false,
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(HASH_A);
    expect(serialized).not.toContain(HASH_B);
    expect(serialized).not.toContain(BYTE_SENTINEL);
    expect(serialized).not.toContain('beta-note-secret');
    expect(serialized).not.toContain('beta-tag-secret');
    expect(serialized).not.toContain('beta-secret.pdf');
    const attachmentSql = queries.filter((query) =>
      query.toLowerCase().includes('note_attachments'),
    );
    expect(attachmentSql.length).toBeGreaterThan(0);
    for (const query of attachmentSql) {
      expect(query.toLowerCase()).not.toContain('"data"');
      expect(query.toLowerCase()).not.toContain('.data');
    }
  });

  it('refuses each collection at its ceiling instead of returning a shortened file', async () => {
    const tight = budget({
      notes: 5,
      tags: 5,
      tasks: 5,
      habits: 5,
      habitChecks: 5,
      moods: 5,
      moodOptions: 5,
      calendarEvents: 5,
      attachments: 5,
      linkRows: 5,
      textBytes: EXPORT_BUDGET.textBytes,
    });
    const cases: Array<{
      label: string;
      limits: Partial<ExportBudget>;
      seed: () => Promise<string>;
    }> = [
      {
        label: 'notes',
        limits: { notes: 1 },
        seed: async () => {
          await dataSource
            .getRepository(Note)
            .save([
              note(userA.id, 'ceiling-note-1'),
              note(userA.id, 'ceiling-note-2'),
            ]);
          return 'ceiling-note-1';
        },
      },
      {
        label: 'tags',
        limits: { tags: 1 },
        seed: async () => {
          await dataSource.getRepository(Tag).save([
            { name: 'ceiling-tag-1', color: 'cyan', user: userA },
            { name: 'ceiling-tag-2', color: 'amber', user: userA },
          ]);
          return 'ceiling-tag-1';
        },
      },
      {
        label: 'tasks',
        limits: { tasks: 1 },
        seed: async () => {
          await dataSource.getRepository(Task).save([
            { userId: userA.id, title: 'ceiling-task-1' },
            { userId: userA.id, title: 'ceiling-task-2' },
          ]);
          return 'ceiling-task-1';
        },
      },
      {
        label: 'habits',
        limits: { habits: 1 },
        seed: async () => {
          await dataSource
            .getRepository(Habit)
            .save([
              habit(userA.id, 'ceiling-habit-1'),
              habit(userA.id, 'ceiling-habit-2'),
            ]);
          return 'ceiling-habit-1';
        },
      },
      {
        label: 'habit checks',
        limits: { habitChecks: 1 },
        seed: async () => {
          const saved = await dataSource
            .getRepository(Habit)
            .save(habit(userA.id, 'check-host'));
          await dataSource.getRepository(HabitCheck).save([
            { habitId: saved.id, date: '2026-11-01' },
            { habitId: saved.id, date: '2026-11-02' },
          ]);
          return '2026-11-01';
        },
      },
      {
        label: 'moods',
        limits: { moods: 1 },
        seed: async () => {
          await dataSource
            .getRepository(Mood)
            .save([
              mood(userA, '2026-03-08', 'ceiling-mood-1'),
              mood(userA, '2026-03-09', 'ceiling-mood-2'),
            ]);
          return 'ceiling-mood-1';
        },
      },
      {
        label: 'mood options',
        limits: { moodOptions: 1 },
        seed: async () => {
          await dataSource
            .getRepository(MoodOption)
            .save([
              option(userA, 'ceiling-option-1'),
              option(userA, 'ceiling-option-2'),
            ]);
          return 'ceiling-option-1';
        },
      },
      {
        label: 'calendar events',
        limits: { calendarEvents: 1 },
        seed: async () => {
          await dataSource
            .getRepository(CalendarEvent)
            .save([
              event(userA.id, 'ceiling-event-1', '2026-11-01'),
              event(userA.id, 'ceiling-event-2', '2026-11-02'),
            ]);
          return 'ceiling-event-1';
        },
      },
      {
        label: 'attachments',
        limits: { attachments: 1 },
        seed: async () => {
          const saved = await dataSource
            .getRepository(Note)
            .save(note(userA.id, 'attachment-host'));
          await dataSource
            .getRepository(NoteAttachment)
            .save([
              attachment(saved.id, userA.id, 'ceiling-file-1.txt'),
              attachment(saved.id, userA.id, 'ceiling-file-2.txt'),
            ]);
          return 'ceiling-file-1.txt';
        },
      },
      {
        label: 'tag links',
        limits: { linkRows: 1, tags: 5, notes: 5 },
        seed: async () => {
          const savedTags = await dataSource.getRepository(Tag).save([
            { name: 'link-a', color: 'cyan', user: userA },
            { name: 'link-b', color: 'amber', user: userA },
          ]);
          await dataSource.getRepository(Note).save({
            ...note(userA.id, 'linked-note'),
            tags: savedTags,
          });
          return 'linked-note';
        },
      },
    ];

    for (const entry of cases) {
      await dataSource.query(
        'TRUNCATE "note_attachments", "note_tags", "task_tags", "habit_check", "habit", "task", "notes", "tags", "mood", "mood_options", "calendar_event" RESTART IDENTITY CASCADE',
      );
      const sentinel = await entry.seed();
      const service = new ExportService(
        dataSource,
        budget({ ...tight, ...entry.limits }),
      );
      try {
        await service.build(userA.id);
        throw new Error(`expected ${entry.label} to be refused`);
      } catch (error) {
        const message = String((error as Error).message);
        expect(message).toContain('No file was produced');
        expect(message).toContain(entry.label);
        expect(message).not.toContain(sentinel);
        expect((error as { getStatus?: () => number }).getStatus?.()).toBe(413);
      }
    }
  });

  it('refuses on stored text size before loading note bodies', async () => {
    await dataSource
      .getRepository(Note)
      .save(note(userA.id, 'tiny-title', 'x'.repeat(80)));
    queries.length = 0;
    const service = new ExportService(
      dataSource,
      budget({ textBytes: 40, notes: 10 }),
    );
    try {
      await service.build(userA.id);
      throw new Error('expected the text ceiling to refuse the export');
    } catch (error) {
      const message = String((error as Error).message);
      expect(message).toContain('stored text limit');
      expect(message).toContain('No file was produced');
      expect((error as { getStatus?: () => number }).getStatus?.()).toBe(413);
    }
    const sql = queries.join('\n');
    expect(sql).toMatch(/octet_length/i);
    expect(sql).not.toMatch(/"note_content"/i);
    expect(sql).not.toContain('xxxxxxxx');
  });
});

function note(
  userId: number,
  title: string,
  content = '<p>x</p>',
): Partial<Note> {
  return {
    userId,
    title,
    content,
    isPinned: false,
    isArchived: false,
  };
}

function habit(userId: number, name: string): Partial<Habit> {
  return {
    userId,
    name,
    color: 'cyan',
    frequency: HabitFrequency.DAILY,
    isActive: true,
  };
}

function mood(user: User, date: string, moodType: string): Partial<Mood> {
  return {
    user,
    moodType,
    emoji: '🌊',
    color: 'cyan',
    note: moodType,
    date,
    backfilled: false,
  };
}

function option(user: User, label: string): Partial<MoodOption> {
  return {
    user,
    label,
    emoji: '🌊',
    color: 'cyan',
    sortOrder: 0,
  };
}

function event(
  userId: number,
  title: string,
  startDate: string,
): Partial<CalendarEvent> {
  return {
    userId,
    title,
    allDay: true,
    startDate,
    color: 'cyan',
  };
}

function attachment(
  noteId: number,
  userId: number,
  filename: string,
): Partial<NoteAttachment> {
  return {
    noteId,
    userId,
    filename,
    mimeType: 'text/plain',
    size: 1,
    data: Buffer.from('x'),
  };
}

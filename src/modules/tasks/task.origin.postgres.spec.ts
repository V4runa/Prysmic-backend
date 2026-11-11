import { NotFoundException } from '@nestjs/common';
import { spawnSync } from 'child_process';
import { DataSource, QueryRunner } from 'typeorm';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { AddTaskOriginNote1790900000000 } from '../../migrations/1790900000000-AddTaskOriginNote';
import { pgBinDir } from '../../testing/pg-bin';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { NotesService } from '../notes/notes.service';
import { Tag } from '../tags/tags.entity';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { Task } from './tasks.entity';
import { TaskService } from './tasks.service';

const PORT = 54358;
const DATA_DIR = '/tmp/task-origin-pg-c3cb';
const CONSTRAINT = 'FK_task_originNoteId_notes';
const TITLE_A = 'alpha-origin-title';
const TITLE_B = 'beta-origin-title';
const BODY_A = '<p>alpha-private-task-origin-body</p>';
const BODY_B = '<p>beta-private-task-origin-body</p>';

describe('Task origin note against disposable Postgres', () => {
  let dataSource: DataSource;
  let taskService: TaskService;
  let notesService: NotesService;
  let userA: User;
  let userB: User;

  beforeAll(async () => {
    spawnSync('rm', ['-rf', DATA_DIR]);
    const init = spawnSync(
      `${pgBinDir()}/initdb`,
      ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust', '--no-instructions'],
      { encoding: 'utf8' },
    );
    if (init.status !== 0) {
      throw new Error(init.stderr || init.stdout || 'initdb failed');
    }
    const start = spawnSync(`${pgBinDir()}/pg_ctl`, [
      '-D',
      DATA_DIR,
      '-l',
      '/tmp/task-origin-pg-c3cb.log',
      '-o',
      `-p ${PORT} -k ${DATA_DIR} -c listen_addresses=127.0.0.1`,
      'start',
    ]);
    if (start.status !== 0) {
      throw new Error('pg_ctl start failed');
    }
    spawnSync(`${pgBinDir()}/createdb`, [
      '-h',
      '127.0.0.1',
      '-p',
      String(PORT),
      '-U',
      'postgres',
      'task_origin_gate',
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: PORT,
      username: 'postgres',
      database: 'task_origin_gate',
      synchronize: true,
      dropSchema: true,
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

    // Synchronize already created the column from the entity. Drop it and
    // install the migration so the test exercises that SQL, including down.
    await dataSource.query(
      `ALTER TABLE "task" DROP COLUMN IF EXISTS "originNoteId"`,
    );
    await apply('up');
    expect(await deleteAction(CONSTRAINT)).toBe('n');
    expect(await originColumn()).toEqual({ exists: true, nullable: true });
    await apply('down');
    expect(await originColumn()).toEqual({ exists: false, nullable: false });
    await apply('up');
    expect(await deleteAction(CONSTRAINT)).toBe('n');

    userA = await dataSource.getRepository(User).save({
      username: 'synth-owner-a',
      email: 'synth-a@example.test',
      password: 'synthetic-hash-task-origin-alpha',
    });
    userB = await dataSource.getRepository(User).save({
      username: 'synth-owner-b',
      email: 'synth-b@example.test',
      password: 'synthetic-hash-task-origin-beta',
    });
    const taskRepo = dataSource.getRepository(Task);
    const noteRepo = dataSource.getRepository(Note);
    taskService = new TaskService(
      taskRepo,
      dataSource.getRepository(User),
      noteRepo,
    );
    notesService = new NotesService(
      noteRepo,
      dataSource.getRepository(Tag),
      dataSource.getRepository(Habit),
      dataSource.getRepository(Task),
      { findById: () => Promise.resolve(null) } as unknown as UserService,
    );
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    spawnSync(`${pgBinDir()}/pg_ctl`, ['-D', DATA_DIR, 'stop']);
    spawnSync('rm', ['-rf', DATA_DIR]);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE "note_attachments", "note_tags", "task_tags", "habit_check", "habit", "task", "notes", "tags", "mood", "mood_options", "calendar_event" RESTART IDENTITY CASCADE',
    );
  });

  it('keeps originNoteId nullable and ON DELETE SET NULL', async () => {
    expect(await deleteAction(CONSTRAINT)).toBe('n');
    expect(await originColumn()).toEqual({ exists: true, nullable: true });
  });

  it('returns id and title for an owned note, and the same 404 otherwise', async () => {
    const noteA = await dataSource.getRepository(Note).save({
      userId: userA.id,
      title: TITLE_A,
      content: BODY_A,
    });
    const noteB = await dataSource.getRepository(Note).save({
      userId: userB.id,
      title: TITLE_B,
      content: BODY_B,
    });
    const before = await dataSource.getRepository(Task).count();

    const created = await taskService.create(
      userA.id,
      { title: 'from-alpha', originNoteId: noteA.id } as CreateTaskDto,
      [],
    );
    expect(created.originNoteId).toBe(noteA.id);
    expect(created.originNote).toEqual({ id: noteA.id, title: TITLE_A });
    expect(Object.keys(created.originNote ?? {}).sort()).toEqual([
      'id',
      'title',
    ]);
    expect(JSON.stringify(created)).not.toContain(BODY_A);
    expect(JSON.stringify(created)).not.toContain(BODY_B);
    expect(JSON.stringify(created)).not.toContain(TITLE_B);

    const one = await taskService.findOne(userA.id, created.id);
    expect(one.originNoteId).toBe(noteA.id);
    expect(one.originNote).toEqual({ id: noteA.id, title: TITLE_A });
    expect(JSON.stringify(one)).not.toContain(BODY_A);

    const listed = await taskService.findAll(userA.id, { archived: false });
    const row = listed.find((task) => task.id === created.id);
    expect(row?.originNoteId).toBe(noteA.id);
    expect(row?.originNote).toEqual({ id: noteA.id, title: TITLE_A });
    expect(JSON.stringify(listed)).not.toContain(BODY_A);
    expect(JSON.stringify(listed)).not.toContain(TITLE_B);

    const plain = await taskService.create(
      userA.id,
      { title: 'no-source' } as CreateTaskDto,
      [],
    );
    expect(plain.originNoteId).toBeNull();
    expect(plain.originNote).toBeNull();

    const missing = await rejection(() =>
      taskService.create(
        userA.id,
        { title: 'missing-source', originNoteId: 999999 } as CreateTaskDto,
        [],
      ),
    );
    const foreign = await rejection(() =>
      taskService.create(
        userA.id,
        { title: 'foreign-source', originNoteId: noteB.id } as CreateTaskDto,
        [],
      ),
    );
    expect(missing).toBeInstanceOf(NotFoundException);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect((foreign as NotFoundException).getResponse()).toEqual(
      (missing as NotFoundException).getResponse(),
    );
    expect((foreign as NotFoundException).getResponse()).toEqual({
      message: 'Note not found',
      error: 'Not Found',
      statusCode: 404,
    });
    expect(
      JSON.stringify((foreign as NotFoundException).getResponse()),
    ).not.toContain(TITLE_B);
    expect(
      JSON.stringify((foreign as NotFoundException).getResponse()),
    ).not.toContain(BODY_B);
    const titles = (
      await taskService.findAll(userA.id, { archived: false })
    ).map((task) => task.title);
    expect(titles).not.toContain('missing-source');
    expect(titles).not.toContain('foreign-source');
    expect(await dataSource.getRepository(Task).count()).toBe(before + 2);
  });

  it('lists originated tasks with isComplete and nulls the pointer when the note is deleted', async () => {
    const noteA = await dataSource.getRepository(Note).save({
      userId: userA.id,
      title: TITLE_A,
      content: BODY_A,
    });
    const noteB = await dataSource.getRepository(Note).save({
      userId: userA.id,
      title: 'kept-note',
      content: '<p>kept-body</p>',
    });
    const open = await taskService.create(
      userA.id,
      { title: 'open-from-alpha', originNoteId: noteA.id } as CreateTaskDto,
      [],
    );
    const done = await taskService.create(
      userA.id,
      { title: 'done-from-alpha', originNoteId: noteA.id } as CreateTaskDto,
      [],
    );
    await taskService.markComplete(userA.id, done.id);
    const archived = await taskService.create(
      userA.id,
      { title: 'archived-from-alpha', originNoteId: noteA.id } as CreateTaskDto,
      [],
    );
    await taskService.archive(userA.id, archived.id);
    const kept = await taskService.create(
      userA.id,
      { title: 'from-kept-note', originNoteId: noteB.id } as CreateTaskDto,
      [],
    );
    // The create endpoint refuses another user's note. A pointer that was
    // written some other way still must not show up on this note.
    await dataSource.getRepository(Task).save({
      userId: userB.id,
      title: 'beta-secret-task',
      originNoteId: noteA.id,
    });

    const read = await notesService.getNoteById(noteA.id, userA.id);
    expect(read.originatedTasks).toEqual([
      { id: open.id, title: 'open-from-alpha', isComplete: false },
      { id: done.id, title: 'done-from-alpha', isComplete: true },
      { id: archived.id, title: 'archived-from-alpha', isComplete: false },
    ]);
    expect(Object.keys(read.originatedTasks?.[0] ?? {}).sort()).toEqual([
      'id',
      'isComplete',
      'title',
    ]);
    expect(JSON.stringify(read.originatedTasks)).not.toContain(
      'beta-secret-task',
    );
    expect(JSON.stringify(read.originatedTasks)).not.toContain(BODY_A);
    expect(read.originatedContracts).toEqual([]);

    await notesService.deleteNote(noteA.id, userA.id);

    const taskRepo = dataSource.getRepository(Task);
    expect(await taskRepo.count()).toBe(5);
    const storedOpen = await taskRepo.findOneBy({ id: open.id });
    const storedDone = await taskRepo.findOneBy({ id: done.id });
    const storedArchived = await taskRepo.findOneBy({ id: archived.id });
    const storedKept = await taskRepo.findOneBy({ id: kept.id });
    expect(storedOpen?.title).toBe('open-from-alpha');
    expect(storedOpen?.originNoteId).toBeNull();
    expect(storedDone?.originNoteId).toBeNull();
    expect(storedArchived?.originNoteId).toBeNull();
    expect(storedKept?.originNoteId).toBe(noteB.id);

    const raw: Array<{ originNoteId: number | null }> = await dataSource.query(
      `SELECT "originNoteId" FROM "task" WHERE "id" = $1`,
      [open.id],
    );
    expect(raw).toEqual([{ originNoteId: null }]);

    const after = await taskService.findOne(userA.id, open.id);
    expect(after.originNoteId).toBeNull();
    expect(after.originNote).toBeNull();
    expect(JSON.stringify(after)).not.toContain(TITLE_A);
    expect(JSON.stringify(after)).not.toContain(BODY_A);

    const listed = await taskService.findAll(userA.id, { archived: false });
    const listedOpen = listed.find((task) => task.id === open.id);
    expect(listedOpen?.originNoteId).toBeNull();
    expect(listedOpen?.originNote).toBeNull();
    expect(JSON.stringify(listed)).not.toContain(BODY_A);
  });

  async function apply(direction: 'up' | 'down'): Promise<void> {
    const runner: QueryRunner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new AddTaskOriginNote1790900000000();
      if (direction === 'up') await migration.up(runner);
      else await migration.down(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async function deleteAction(name: string): Promise<string> {
    const found: Array<{ confdeltype: string | Buffer }> =
      await dataSource.query(
        `SELECT confdeltype FROM pg_constraint WHERE conname = $1`,
        [name],
      );
    if (found.length !== 1) {
      throw new Error(`constraint ${name} count ${found.length}`);
    }
    const value = found[0].confdeltype;
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    return String(value);
  }

  async function originColumn(): Promise<{
    exists: boolean;
    nullable: boolean;
  }> {
    const found: Array<{ is_nullable: string }> = await dataSource.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'task'
         AND column_name = 'originNoteId'`,
    );
    if (found.length === 0) return { exists: false, nullable: false };
    return { exists: true, nullable: found[0].is_nullable === 'YES' };
  }
});

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

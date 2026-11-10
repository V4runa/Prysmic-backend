import { Logger, DataSource } from 'typeorm';
import { spawnSync } from 'child_process';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { Note } from '../notes/notes.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Tag } from '../tags/tags.entity';
import { TagsService } from '../tags/tags.service';
import { Task } from './tasks.entity';
import { TaskController } from './tasks.controller';
import { TaskService } from './tasks.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { Habit } from '../habits/habit.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Mood } from '../moods/mood.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { UpdateTaskDto } from '../../dtos/update-task.dto';
import { pgBinDir } from '../../testing/pg-bin';

const PORT = 54348;
const DATA_DIR = '/tmp/task-tags-pg-dd9c';
const HASH_A = 'synthetic-hash-task-tags-alpha';
const HASH_B = 'synthetic-hash-task-tags-beta';

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

function asRequest(userId: number): Request {
  return { user: { userId } } as unknown as Request;
}

function serializedKeys(value: unknown): string[] {
  // JSON.stringify drops undefined class fields, which is what the client sees.
  const encoded = JSON.stringify(value);
  const parsed: unknown = JSON.parse(encoded);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  return Object.keys(parsed).sort();
}

describe('Shared note and task tags against disposable Postgres', () => {
  let dataSource: DataSource;
  let tasks: TaskController;
  let taskService: TaskService;
  let tagsService: TagsService;
  let userA: User;
  let userB: User;
  const queries: string[] = [];

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
      '/tmp/task-tags-pg-dd9c.log',
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
      'task_tags_gate',
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: PORT,
      username: 'postgres',
      database: 'task_tags_gate',
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
    const taskRepo = dataSource.getRepository(Task);
    const tagRepo = dataSource.getRepository(Tag);
    taskService = new TaskService(taskRepo, dataSource.getRepository(User));
    tagsService = new TagsService(tagRepo, {
      findById: async (id: number) =>
        dataSource.getRepository(User).findOneBy({ id }),
    } as unknown as UserService);
    tasks = new TaskController(taskService, tagsService);
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
    queries.length = 0;
  });

  it('uses the existing task_tags columns and does not add count columns', async () => {
    const relation = dataSource
      .getMetadata(Task)
      .findRelationWithPropertyPath('tags');
    expect(relation?.isManyToMany).toBe(true);
    expect(relation?.joinTableName).toBe('task_tags');
    expect(relation?.joinColumns.map((column) => column.databaseName)).toEqual([
      'taskId',
    ]);
    expect(
      relation?.inverseJoinColumns.map((column) => column.databaseName),
    ).toEqual(['tagsId']);

    const taskTagColumns: Array<{ column_name: string }> =
      await dataSource.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'task_tags'
         ORDER BY column_name`,
      );
    expect(taskTagColumns.map((column) => column.column_name)).toEqual([
      'tagsId',
      'taskId',
    ]);

    const tagColumns: Array<{ column_name: string }> = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tags'`,
    );
    const names = tagColumns.map((column) => column.column_name);
    expect(names).not.toContain('noteCount');
    expect(names).not.toContain('taskCount');
    expect(names).not.toContain('note_count');
    expect(names).not.toContain('task_count');
  });

  it('saves owned tags, leaves them when omitted, clears them when empty, and filters without dropping sibling tags', async () => {
    const tagRepo = dataSource.getRepository(Tag);
    const work = await tagRepo.save({
      name: 'work',
      color: 'cyan',
      user: userA,
    });
    const home = await tagRepo.save({
      name: 'home',
      color: 'amber',
      user: userA,
    });
    const secret = await tagRepo.save({
      name: 'beta-secret-tag',
      color: 'rose',
      user: userB,
    });
    await dataSource.getRepository(Task).save({
      userId: userB.id,
      user: userB,
      title: 'beta-secret-task',
      tags: [secret],
    });

    const created = await tasks.create(asRequest(userA.id), {
      title: 'Ship shared tags',
      description: 'notes and tasks',
      tagIds: [work.id, home.id],
    } as CreateTaskDto);
    expect(created.user).toBeUndefined();
    expect(created.tags?.map((tag) => tag.id).sort()).toEqual(
      [home.id, work.id].sort(),
    );
    expect(created.tags?.map((tag) => tag.name).sort()).toEqual([
      'home',
      'work',
    ]);
    expect(JSON.stringify(created)).not.toContain(HASH_A);
    expect(JSON.stringify(created)).not.toContain('beta-secret');

    const note = await dataSource.getRepository(Note).save({
      userId: userA.id,
      title: 'Same tags',
      content: '<p>shared</p>',
      tags: [work],
    });
    const loadedNote = await dataSource.getRepository(Note).findOne({
      where: { id: note.id },
      relations: ['tags'],
    });
    const loadedTask = await taskService.findOne(userA.id, created.id);
    expect(serializedKeys(loadedTask.tags?.[0])).toEqual(
      serializedKeys(loadedNote?.tags[0]),
    );
    expect(serializedKeys(loadedTask.tags?.[0])).toEqual([
      'color',
      'id',
      'name',
    ]);

    const renamed = await tasks.update(asRequest(userA.id), created.id, {
      title: 'Renamed only',
    } as UpdateTaskDto);
    expect(renamed.title).toBe('Renamed only');
    expect(renamed.tags?.map((tag) => tag.id).sort()).toEqual(
      [home.id, work.id].sort(),
    );

    const cleared = await tasks.update(asRequest(userA.id), created.id, {
      tagIds: [],
    } as UpdateTaskDto);
    expect(cleared.tags).toEqual([]);
    expect(cleared.title).toBe('Renamed only');

    const replaced = await tasks.update(asRequest(userA.id), created.id, {
      tagIds: [home.id],
    } as UpdateTaskDto);
    expect(replaced.tags?.map((tag) => tag.id)).toEqual([home.id]);

    const before = await dataSource.getRepository(Task).count();
    await expect(
      tasks.create(asRequest(userA.id), {
        title: 'should-not-insert',
        tagIds: [secret.id],
      } as CreateTaskDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      tasks.update(asRequest(userA.id), created.id, {
        title: 'should-not-stick',
        tagIds: [work.id, secret.id],
      } as UpdateTaskDto),
    ).rejects.toMatchObject({
      message: 'Some of the provided tag IDs do not exist',
    });
    expect(await dataSource.getRepository(Task).count()).toBe(before);
    const untouched = await taskService.findOne(userA.id, created.id);
    expect(untouched.title).toBe('Renamed only');
    expect(untouched.tags?.map((tag) => tag.id)).toEqual([home.id]);

    const alsoWork = await tasks.create(asRequest(userA.id), {
      title: 'Also work',
      tagIds: [work.id, home.id],
    } as CreateTaskDto);
    await tasks.create(asRequest(userA.id), {
      title: 'Plain',
      tagIds: [],
    } as CreateTaskDto);

    const filtered = await taskService.findAll(userA.id, {
      archived: false,
      tagId: work.id,
    });
    expect(filtered.map((task) => task.title).sort()).toEqual(['Also work']);
    const withSiblings = filtered.find((task) => task.id === alsoWork.id);
    expect(withSiblings?.tags?.map((tag) => tag.id).sort()).toEqual(
      [home.id, work.id].sort(),
    );
    expect(JSON.stringify(filtered)).not.toContain('beta-secret-task');

    const none = await taskService.findAll(userA.id, {
      archived: false,
      tagId: secret.id,
    });
    expect(none).toEqual([]);

    const page = await taskService.findAll(userA.id, {
      archived: false,
      tagId: home.id,
      sortBy: 'title',
      order: 'asc',
      limit: 1,
      offset: 0,
    });
    expect(page).toHaveLength(1);
    expect(page[0].title).toBe('Also work');
    expect(page[0].tags?.map((tag) => tag.name).sort()).toEqual([
      'home',
      'work',
    ]);
  });

  it('counts notes and tasks once for many tags, including a tag used by both', async () => {
    const tagRepo = dataSource.getRepository(Tag);
    const noteRepo = dataSource.getRepository(Note);
    const taskRepo = dataSource.getRepository(Task);
    const work = await tagRepo.save({
      name: 'work',
      color: 'cyan',
      user: userA,
    });
    const home = await tagRepo.save({
      name: 'home',
      color: 'amber',
      user: userA,
    });
    await tagRepo.save({
      name: 'solo',
      color: 'gray',
      user: userA,
    });
    const errand = await tagRepo.save({
      name: 'errand',
      color: 'green',
      user: userA,
    });
    await tagRepo.save({
      name: 'beta-secret-tag',
      color: 'rose',
      user: userB,
    });

    await noteRepo.save({
      userId: userA.id,
      title: 'n1',
      content: '<p>one</p>',
      tags: [work, home],
    });
    await noteRepo.save({
      userId: userA.id,
      title: 'n2',
      content: '<p>two</p>',
      tags: [work],
    });
    await taskRepo.save({
      userId: userA.id,
      user: userA,
      title: 't1',
      tags: [work, home],
    });
    await taskRepo.save({
      userId: userA.id,
      user: userA,
      title: 't2',
      tags: [work],
    });
    await taskRepo.save({
      userId: userA.id,
      user: userA,
      title: 't3',
      tags: [work],
    });
    await taskRepo.save({
      userId: userA.id,
      user: userA,
      title: 't4',
      tags: [errand],
    });

    queries.length = 0;
    const listed = await tagsService.getAllTags(userA.id);
    const firstQueries = queries.length;
    const summary = listed.map((tag) => ({
      name: tag.name,
      noteCount: tag.noteCount,
      taskCount: tag.taskCount,
      noteType: typeof tag.noteCount,
      taskType: typeof tag.taskCount,
    }));
    expect(summary).toEqual([
      {
        name: 'errand',
        noteCount: 0,
        taskCount: 1,
        noteType: 'number',
        taskType: 'number',
      },
      {
        name: 'home',
        noteCount: 1,
        taskCount: 1,
        noteType: 'number',
        taskType: 'number',
      },
      {
        name: 'solo',
        noteCount: 0,
        taskCount: 0,
        noteType: 'number',
        taskType: 'number',
      },
      {
        name: 'work',
        noteCount: 2,
        taskCount: 3,
        noteType: 'number',
        taskType: 'number',
      },
    ]);
    const countSql = queries.filter((sql) => /count/i.test(sql));
    expect(countSql).toHaveLength(2);
    expect(countSql.join('\n')).toMatch(/note_tags/i);
    expect(countSql.join('\n')).toMatch(/task_tags/i);
    expect(JSON.stringify(listed)).not.toContain('beta-secret-tag');
    expect(JSON.stringify(listed)).not.toContain(HASH_A);
    expect(serializedKeys(listed[0])).toEqual([
      'color',
      'id',
      'name',
      'noteCount',
      'taskCount',
    ]);

    await tagRepo.save({ name: 'zeta', color: 'blue', user: userA });
    await tagRepo.save({ name: 'alpha', color: 'red', user: userA });
    queries.length = 0;
    await tagsService.getAllTags(userA.id);
    expect(queries.length).toBe(firstQueries);
  });

  it('returns 409 for a tag still on a note or a task, then deletes once nothing uses it', async () => {
    const tagRepo = dataSource.getRepository(Tag);
    const onNote = await tagRepo.save({
      name: 'on-note',
      color: 'cyan',
      user: userA,
    });
    const onTask = await tagRepo.save({
      name: 'on-task',
      color: 'amber',
      user: userA,
    });
    const free = await tagRepo.save({
      name: 'free',
      color: 'gray',
      user: userA,
    });
    const secret = await tagRepo.save({
      name: 'beta-secret-tag',
      color: 'rose',
      user: userB,
    });
    await dataSource.getRepository(Note).save({
      userId: userA.id,
      title: 'keeps the tag',
      content: '<p>keep</p>',
      tags: [onNote],
    });
    const task = await dataSource.getRepository(Task).save({
      userId: userA.id,
      user: userA,
      title: 'keeps the tag',
      tags: [onTask],
    });

    await expect(
      tagsService.deleteTag(onNote.id, userA.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(tagsService.deleteTag(onTask.id, userA.id)).rejects.toThrow(
      'This tag is still in use. Remove it from your notes and tasks before deleting it.',
    );
    expect(await tagRepo.findOneBy({ id: onNote.id })).not.toBeNull();
    expect(await tagRepo.findOneBy({ id: onTask.id })).not.toBeNull();

    await expect(
      tagsService.deleteTag(secret.id, userA.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await tagRepo.findOneBy({ id: secret.id })).not.toBeNull();

    await tagsService.deleteTag(free.id, userA.id);
    expect(await tagRepo.findOneBy({ id: free.id })).toBeNull();

    const noteRepo = dataSource.getRepository(Note);
    const keptNote = await noteRepo.findOne({
      where: { title: 'keeps the tag' },
      relations: ['tags'],
    });
    if (!keptNote) throw new Error('note missing');
    keptNote.tags = [];
    await noteRepo.save(keptNote);
    const taskRepo = dataSource.getRepository(Task);
    const keptTask = await taskRepo.findOne({
      where: { id: task.id },
      relations: ['tags'],
    });
    if (!keptTask) throw new Error('task missing');
    keptTask.tags = [];
    await taskRepo.save(keptTask);

    await tagsService.deleteTag(onNote.id, userA.id);
    await tagsService.deleteTag(onTask.id, userA.id);
    expect(await tagRepo.findOneBy({ id: onNote.id })).toBeNull();
    expect(await tagRepo.findOneBy({ id: onTask.id })).toBeNull();
    expect(
      await dataSource
        .getRepository(Note)
        .findOneBy({ title: 'keeps the tag' }),
    ).not.toBeNull();
    expect(
      await dataSource.getRepository(Task).findOneBy({ id: task.id }),
    ).not.toBeNull();
  });
});

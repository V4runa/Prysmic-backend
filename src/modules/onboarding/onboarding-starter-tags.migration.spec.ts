import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { DataSource } from 'typeorm';
import {
  gratitudeSampleNote,
  somedaySampleNote,
  somedaySampleTask,
  starterTag,
  UseOnboardingStarterTags1790800000000,
} from '../../migrations/1790800000000-UseOnboardingStarterTags';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { OnboardingService } from './onboarding.service';
import { Tag } from '../tags/tags.entity';
import { Task, TaskPriority } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import { pgBinDir } from '../../testing/pg-bin';

const PORT = 54356;
const DATA_DIR = '/tmp/prysmic-starter-tags-pg';
const LOG = '/tmp/prysmic-starter-tags-pg.log';
const DATABASE = 'prysmic_starter_tags';
const FROZEN = new Date('2024-06-01T12:00:00.000Z');

jest.setTimeout(60000);

describe('onboarding starter tag migration', () => {
  let dataSource: DataSource;
  const migration = new UseOnboardingStarterTags1790800000000();

  beforeAll(async () => {
    startPostgres();
    dataSource = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: PORT,
      username: 'postgres',
      database: DATABASE,
      synchronize: true,
      dropSchema: true,
      logging: false,
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    spawnSync(`${pgBinDir()}/pg_ctl`, ['-D', DATA_DIR, '-m', 'fast', 'stop']);
    spawnSync('rm', ['-rf', DATA_DIR]);
  });

  it('links untouched samples and leaves any edit in place', async () => {
    const columns: Array<{ table_name: string; column_name: string }> =
      await dataSource.query(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('note_tags', 'task_tags')
         ORDER BY table_name, column_name`,
      );
    expect(columns).toEqual([
      { table_name: 'note_tags', column_name: 'notesId' },
      { table_name: 'note_tags', column_name: 'tagsId' },
      { table_name: 'task_tags', column_name: 'tagsId' },
      { table_name: 'task_tags', column_name: 'taskId' },
    ]);

    const kept = await user('kept-owner');
    const keptTags = await starterTags(kept);
    const keptThought = await note(
      kept,
      gratitudeSampleNote.title,
      gratitudeSampleNote.from,
      [keptTags.reflections],
      { isPinned: true },
    );
    const keptIdea = await note(
      kept,
      somedaySampleNote.title,
      somedaySampleNote.content,
      [keptTags.ideas],
    );
    const keptTask = await task(
      kept,
      somedaySampleTask.title,
      somedaySampleTask.description,
      [],
      { isComplete: true, priority: TaskPriority.HIGH },
    );
    const grocery = await note(
      kept,
      'Grocery list',
      'Milk, and a good moment.',
      [],
    );

    const edited = await user('edited-owner');
    const editedTags = await starterTags(edited);
    const personal = await dataSource.getRepository(Tag).save({
      name: 'Personal',
      color: 'rose',
      user: edited,
    });
    const retaggedThought = await note(
      edited,
      gratitudeSampleNote.title,
      gratitudeSampleNote.from,
      [editedTags.reflections, personal],
    );
    const rewrittenThought = await note(
      edited,
      gratitudeSampleNote.title,
      `${gratitudeSampleNote.from}\nA line I added.`,
      [editedTags.reflections],
    );
    const renamedIdea = await note(
      edited,
      "An idea I'm still working on (renamed)",
      somedaySampleNote.content,
      [editedTags.ideas],
    );
    const retaggedIdea = await note(
      edited,
      somedaySampleNote.title,
      somedaySampleNote.content,
      [editedTags.ideas, personal],
    );
    const rewrittenTask = await task(
      edited,
      somedaySampleTask.title,
      'I rewrote this task.',
      [],
    );
    const retaggedTask = await task(
      edited,
      somedaySampleTask.title,
      somedaySampleTask.description,
      [personal],
    );

    const recolored = await user('recolored-owner');
    const recoloredTags = await starterTags(recolored, { gratitude: 'blue' });
    const recoloredThought = await note(
      recolored,
      gratitudeSampleNote.title,
      gratitudeSampleNote.from,
      [recoloredTags.reflections],
    );
    const recoloredIdea = await note(
      recolored,
      somedaySampleNote.title,
      somedaySampleNote.content,
      [recoloredTags.ideas],
    );
    const recoloredTask = await task(
      recolored,
      somedaySampleTask.title,
      somedaySampleTask.description,
      [],
    );

    const missing = await user('missing-tags');
    const missingReflections = await dataSource.getRepository(Tag).save({
      name: starterTag.reflections.name,
      color: starterTag.reflections.color,
      user: missing,
    });
    const missingIdeas = await dataSource.getRepository(Tag).save({
      name: starterTag.ideas.name,
      color: starterTag.ideas.color,
      user: missing,
    });
    const missingThought = await note(
      missing,
      gratitudeSampleNote.title,
      gratitudeSampleNote.from,
      [missingReflections],
    );
    const missingIdea = await note(
      missing,
      somedaySampleNote.title,
      somedaySampleNote.content,
      [missingIdeas],
    );
    const missingTask = await task(
      missing,
      somedaySampleTask.title,
      somedaySampleTask.description,
      [],
    );

    const other = await user('other-owner');
    const otherTags = await starterTags(other);
    const otherThought = await note(
      other,
      gratitudeSampleNote.title,
      gratitudeSampleNote.from,
      [otherTags.reflections],
    );
    const otherIdea = await note(
      other,
      somedaySampleNote.title,
      somedaySampleNote.content,
      [otherTags.ideas],
    );
    const otherTask = await task(
      other,
      somedaySampleTask.title,
      somedaySampleTask.description,
      [],
      { priority: TaskPriority.LOW },
    );

    const current = await user('already-current');
    const currentTags = await starterTags(current);
    const currentThought = await note(
      current,
      gratitudeSampleNote.title,
      gratitudeSampleNote.to,
      [currentTags.reflections, currentTags.gratitude],
    );
    const currentIdea = await note(
      current,
      somedaySampleNote.title,
      somedaySampleNote.content,
      [currentTags.ideas, currentTags.someday],
    );
    const currentTask = await task(
      current,
      somedaySampleTask.title,
      somedaySampleTask.description,
      [currentTags.someday],
    );

    await freezeTimestamps();
    const beforeUp = await timestamps();
    await run('up');
    await run('up');
    expect(await timestamps()).toBe(beforeUp);

    await expectNote(
      keptThought,
      gratitudeSampleNote.to,
      ['Gratitude', 'Reflections'],
      { isPinned: true },
    );
    expect(await tagIds(keptThought)).toEqual(
      [keptTags.gratitude.id, keptTags.reflections.id].sort((a, b) => a - b),
    );
    await expectNote(keptIdea, somedaySampleNote.content, ['Ideas', 'Someday']);
    await expectTask(keptTask, ['Someday'], {
      isComplete: true,
      priority: TaskPriority.HIGH,
    });
    await expectNote(grocery, 'Milk, and a good moment.', []);

    await expectNote(retaggedThought, gratitudeSampleNote.from, [
      'Personal',
      'Reflections',
    ]);
    await expectNote(
      rewrittenThought,
      `${gratitudeSampleNote.from}\nA line I added.`,
      ['Reflections'],
    );
    await expectNote(renamedIdea, somedaySampleNote.content, ['Ideas'], {
      title: "An idea I'm still working on (renamed)",
    });
    await expectNote(retaggedIdea, somedaySampleNote.content, [
      'Ideas',
      'Personal',
    ]);
    await expectTask(rewrittenTask, [], {
      description: 'I rewrote this task.',
    });
    await expectTask(retaggedTask, ['Personal']);

    await expectNote(recoloredThought, gratitudeSampleNote.from, [
      'Reflections',
    ]);
    await expectNote(recoloredIdea, somedaySampleNote.content, [
      'Ideas',
      'Someday',
    ]);
    await expectTask(recoloredTask, ['Someday']);

    await expectNote(missingThought, gratitudeSampleNote.from, ['Reflections']);
    await expectNote(missingIdea, somedaySampleNote.content, ['Ideas']);
    await expectTask(missingTask, []);

    await expectNote(otherThought, gratitudeSampleNote.to, [
      'Gratitude',
      'Reflections',
    ]);
    expect(await tagIds(otherThought)).toEqual(
      [otherTags.gratitude.id, otherTags.reflections.id].sort((a, b) => a - b),
    );
    await expectNote(otherIdea, somedaySampleNote.content, [
      'Ideas',
      'Someday',
    ]);
    expect(await tagIds(otherIdea)).toEqual(
      [otherTags.ideas.id, otherTags.someday.id].sort((a, b) => a - b),
    );
    await expectTask(otherTask, ['Someday'], { priority: TaskPriority.LOW });
    expect(await taskTagIds(otherTask)).toEqual([otherTags.someday.id]);

    await expectNote(currentThought, gratitudeSampleNote.to, [
      'Gratitude',
      'Reflections',
    ]);
    await expectNote(currentIdea, somedaySampleNote.content, [
      'Ideas',
      'Someday',
    ]);
    await expectTask(currentTask, ['Someday']);

    const reloaded = await dataSource.getRepository(Note).findOneOrFail({
      where: { id: keptThought.id },
      relations: ['tags'],
    });
    reloaded.content = 'I rewrote this after the update.';
    await dataSource.getRepository(Note).save(reloaded);
    const beforeDown = await timestamps();
    await run('down');
    expect(await timestamps()).toBe(beforeDown);

    await expectNote(
      reloaded,
      'I rewrote this after the update.',
      ['Gratitude', 'Reflections'],
      { isPinned: true },
    );
    await expectNote(keptIdea, somedaySampleNote.content, ['Ideas']);
    await expectTask(keptTask, [], {
      isComplete: true,
      priority: TaskPriority.HIGH,
    });
    await expectNote(otherThought, gratitudeSampleNote.from, ['Reflections']);
    await expectNote(otherIdea, somedaySampleNote.content, ['Ideas']);
    await expectTask(otherTask, [], { priority: TaskPriority.LOW });
    await expectNote(recoloredThought, gratitudeSampleNote.from, [
      'Reflections',
    ]);
    await expectNote(recoloredIdea, somedaySampleNote.content, ['Ideas']);
    await expectTask(recoloredTask, []);
    await expectNote(currentThought, gratitudeSampleNote.from, ['Reflections']);
    await expectNote(currentIdea, somedaySampleNote.content, ['Ideas']);
    await expectTask(currentTask, []);
    await expectNote(retaggedThought, gratitudeSampleNote.from, [
      'Personal',
      'Reflections',
    ]);
    await expectTask(retaggedTask, ['Personal']);
    await expectNote(missingThought, gratitudeSampleNote.from, ['Reflections']);
    await expectTask(missingTask, []);
    await expectNote(grocery, 'Milk, and a good moment.', []);

    const tagIdsAfter = await dataSource.getRepository(Tag).find({
      order: { id: 'ASC' },
    });
    expect(tagIdsAfter.map((tag) => tag.id)).toEqual(
      [
        ...Object.values(keptTags),
        ...Object.values(editedTags),
        personal,
        ...Object.values(recoloredTags),
        missingReflections,
        missingIdeas,
        ...Object.values(otherTags),
        ...Object.values(currentTags),
      ]
        .map((tag) => tag.id)
        .sort((a, b) => a - b),
    );
  });

  it('persists every starter tag on a note or a task for a new account', async () => {
    const owner = await user('fresh-signup');
    const service = new OnboardingService(
      dataSource.getRepository(Tag),
      dataSource.getRepository(Note),
      dataSource.getRepository(Habit),
      dataSource.getRepository(Task),
    );
    await service.seedSampleData(owner.id);

    const counts: Array<{ name: string; notes: string; tasks: string }> =
      await dataSource.query(
        `SELECT t.name,
                (SELECT COUNT(*) FROM "note_tags" nt WHERE nt."tagsId" = t.id) AS notes,
                (SELECT COUNT(*) FROM "task_tags" tt WHERE tt."tagsId" = t.id) AS tasks
         FROM "tags" t
         WHERE t."userId" = $1
         ORDER BY t.name`,
        [owner.id],
      );
    expect(
      counts.map((row) => ({
        name: row.name,
        notes: Number(row.notes),
        tasks: Number(row.tasks),
      })),
    ).toEqual([
      { name: 'Gratitude', notes: 1, tasks: 0 },
      { name: 'Ideas', notes: 1, tasks: 0 },
      { name: 'Reflections', notes: 2, tasks: 0 },
      { name: 'Someday', notes: 1, tasks: 1 },
    ]);

    const notes = await dataSource.getRepository(Note).find({
      where: { userId: owner.id },
      relations: ['tags'],
    });
    const thought = notes.find(
      (row) => row.title === gratitudeSampleNote.title,
    );
    expect(thought?.content).toBe(gratitudeSampleNote.to);
    expect(names(thought?.tags)).toEqual(['Gratitude', 'Reflections']);
    const idea = notes.find((row) => row.title === somedaySampleNote.title);
    expect(names(idea?.tags)).toEqual(['Ideas', 'Someday']);

    const tasks = await dataSource.getRepository(Task).find({
      where: { userId: owner.id },
      relations: ['tags'],
    });
    const forge = tasks.find((row) => row.title === somedaySampleTask.title);
    expect(forge?.description).toBe(somedaySampleTask.description);
    expect(names(forge?.tags)).toEqual(['Someday']);
  });

  async function user(username: string): Promise<User> {
    return dataSource.getRepository(User).save({
      username,
      email: `${username}@example.test`,
      password: 'synthetic-hash',
    });
  }

  async function starterTags(
    owner: User,
    colors: { gratitude?: string } = {},
  ): Promise<Record<'reflections' | 'ideas' | 'gratitude' | 'someday', Tag>> {
    const tags = dataSource.getRepository(Tag);
    const reflections = await tags.save({
      ...starterTag.reflections,
      user: owner,
    });
    const ideas = await tags.save({ ...starterTag.ideas, user: owner });
    const gratitude = await tags.save({
      name: starterTag.gratitude.name,
      color: colors.gratitude ?? starterTag.gratitude.color,
      user: owner,
    });
    const someday = await tags.save({ ...starterTag.someday, user: owner });
    return { reflections, ideas, gratitude, someday };
  }

  async function note(
    owner: User,
    title: string,
    content: string,
    tags: Tag[],
    extra: { isPinned?: boolean } = {},
  ): Promise<Note> {
    return dataSource.getRepository(Note).save({
      title,
      content,
      userId: owner.id,
      isPinned: extra.isPinned ?? false,
      tags,
    });
  }

  async function task(
    owner: User,
    title: string,
    description: string,
    tags: Tag[],
    extra: { isComplete?: boolean; priority?: TaskPriority } = {},
  ): Promise<Task> {
    return dataSource.getRepository(Task).save({
      title,
      description,
      userId: owner.id,
      priority: extra.priority ?? TaskPriority.MEDIUM,
      isComplete: extra.isComplete ?? false,
      tags,
    });
  }

  async function freezeTimestamps(): Promise<void> {
    for (const table of ['notes', 'task']) {
      await dataSource.query(`UPDATE "${table}" SET "updatedAt" = $1`, [
        FROZEN,
      ]);
    }
  }

  async function run(direction: 'up' | 'down'): Promise<void> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
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

  async function expectNote(
    saved: Note,
    content: string,
    tagNames: string[],
    extra: { isPinned?: boolean; title?: string } = {},
  ): Promise<void> {
    const row = await dataSource.getRepository(Note).findOneOrFail({
      where: { id: saved.id },
      relations: ['tags'],
    });
    expect(row.title).toBe(extra.title ?? saved.title);
    expect(row.content).toBe(content);
    expect(row.userId).toBe(saved.userId);
    expect(row.isPinned).toBe(extra.isPinned ?? saved.isPinned);
    expect(names(row.tags)).toEqual([...tagNames].sort());
  }

  async function expectTask(
    saved: Task,
    tagNames: string[],
    extra: {
      description?: string;
      isComplete?: boolean;
      priority?: TaskPriority;
    } = {},
  ): Promise<void> {
    const row = await dataSource.getRepository(Task).findOneOrFail({
      where: { id: saved.id },
      relations: ['tags'],
    });
    expect(row.title).toBe(saved.title);
    expect(row.description).toBe(extra.description ?? saved.description);
    expect(row.userId).toBe(saved.userId);
    expect(row.isComplete).toBe(extra.isComplete ?? saved.isComplete);
    expect(row.priority).toBe(extra.priority ?? saved.priority);
    expect(names(row.tags)).toEqual([...tagNames].sort());
  }

  async function tagIds(saved: Note): Promise<number[]> {
    const row = await dataSource.getRepository(Note).findOneOrFail({
      where: { id: saved.id },
      relations: ['tags'],
    });
    return row.tags.map((tag) => tag.id).sort((a, b) => a - b);
  }

  async function taskTagIds(saved: Task): Promise<number[]> {
    const row = await dataSource.getRepository(Task).findOneOrFail({
      where: { id: saved.id },
      relations: ['tags'],
    });
    return (row.tags ?? []).map((tag) => tag.id).sort((a, b) => a - b);
  }

  async function timestamps(): Promise<string> {
    const [notes, tasks] = await Promise.all([
      dataSource.getRepository(Note).find({ order: { id: 'ASC' } }),
      dataSource.getRepository(Task).find({ order: { id: 'ASC' } }),
    ]);
    return JSON.stringify({
      notes: notes.map((row) => [row.id, row.updatedAt.getTime()]),
      tasks: tasks.map((row) => [row.id, row.updatedAt.getTime()]),
    });
  }
});

function names(tags?: { name: string }[]): string[] {
  return (tags ?? []).map((tag) => tag.name).sort();
}

function startPostgres(): void {
  spawnSync('rm', ['-rf', DATA_DIR]);
  const init = spawnSync(
    `${pgBinDir()}/initdb`,
    ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust', '--no-instructions'],
    { encoding: 'utf8' },
  );
  if (init.status !== 0) {
    throw new Error(init.stderr || init.stdout || 'initdb failed');
  }
  const started = spawnSync(`${pgBinDir()}/pg_ctl`, [
    '-D',
    DATA_DIR,
    '-l',
    LOG,
    '-w',
    '-o',
    `-p ${PORT} -k ${DATA_DIR} -c listen_addresses=127.0.0.1`,
    'start',
  ]);
  if (started.status !== 0) {
    const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
    throw new Error(`pg_ctl start failed\n${log}`);
  }
  const created = spawnSync(`${pgBinDir()}/createdb`, [
    '-h',
    '127.0.0.1',
    '-p',
    String(PORT),
    '-U',
    'postgres',
    DATABASE,
  ]);
  if (created.status !== 0) {
    throw new Error('createdb failed');
  }
}

import { spawnSync } from 'child_process';
import { DataSource } from 'typeorm';
import { HabitFrequency } from '../../enums/habit-frequency.enum';
import {
  onboardingSampleRewrites,
  RewriteOnboardingSampleCopy1790700000000,
  type SampleRewrite,
} from '../../migrations/1790700000000-RewriteOnboardingSampleCopy';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Task, TaskPriority } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import { pgBinDir } from '../../testing/pg-bin';

const PORT = 54354;
const DATA_DIR = '/tmp/prysmic-sample-copy-pg';
const LOG = '/tmp/prysmic-sample-copy-pg.log';
const DATABASE = 'prysmic_sample_copy';
const FROZEN = new Date('2024-06-01T12:00:00.000Z');

jest.setTimeout(60000);

describe('onboarding sample copy migration', () => {
  let dataSource: DataSource;
  const migration = new RewriteOnboardingSampleCopy1790700000000();

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

  it('rewrites an untouched sample and leaves any edit in place', async () => {
    const owner = await user('kept-owner');
    const other = await user('other-owner');

    const exactNote = await note(owner, rewrite('notes', 0).from, {
      isPinned: true,
    });
    const editedBody = await note(owner, {
      ...rewrite('notes', 0).from,
      content: `${rewrite('notes', 0).from.content}\nA line I added.`,
    });
    const exactThought = await note(other, rewrite('notes', 1).from);
    const editedTitle = await note(owner, {
      ...rewrite('notes', 2).from,
      title: 'Ideas are fragile things (renamed)',
    });
    const exactIdea = await note(other, rewrite('notes', 2).from, {
      isPinned: false,
    });
    const ownWriting = await note(owner, {
      title: 'Grocery list',
      content: 'Nothing here is precious is a phrase I quoted on purpose.',
    });

    const exactHabit = await habit(owner, rewrite('habit', 0).from, {
      color: 'cyan',
      icon: 'moon',
    });
    const editedAffirmation = await habit(
      owner,
      {
        ...rewrite('habit', 1).from,
        affirmation: 'I changed this line.',
      },
      { color: 'emerald', icon: 'flame' },
    );
    const exactMove = await habit(other, rewrite('habit', 1).from, {
      color: 'emerald',
      icon: 'flame',
    });
    const exactRead = await habit(other, rewrite('habit', 2).from, {
      color: 'violet',
      icon: 'book',
    });

    const exactTask = await task(
      owner,
      rewrite('task', 0).from,
      TaskPriority.HIGH,
    );
    const editedTask = await task(
      owner,
      {
        ...rewrite('task', 1).from,
        description: 'Open Notes and write a single line that is truly mine.',
      },
      TaskPriority.MEDIUM,
    );
    const exactCapture = await task(
      other,
      rewrite('task', 1).from,
      TaskPriority.MEDIUM,
    );
    const unchangedTask = await task(
      owner,
      {
        title: 'Forge your first Contract',
        description:
          'Head to Contracts and commit to one small thing, daily. Watch the streak grow.',
      },
      TaskPriority.LOW,
    );

    await freezeTimestamps();
    const beforeUp = await timestamps();
    await run('up');
    expect(await timestamps()).toBe(beforeUp);

    await expectNote(exactNote, rewrite('notes', 0).to, { isPinned: true });
    await expectNote(editedBody, {
      title: rewrite('notes', 0).from.title,
      content: `${rewrite('notes', 0).from.content}\nA line I added.`,
    });
    await expectNote(exactThought, rewrite('notes', 1).to);
    await expectNote(editedTitle, {
      title: 'Ideas are fragile things (renamed)',
      content: rewrite('notes', 2).from.content,
    });
    await expectNote(exactIdea, rewrite('notes', 2).to, { isPinned: false });
    await expectNote(ownWriting, {
      title: 'Grocery list',
      content: 'Nothing here is precious is a phrase I quoted on purpose.',
    });

    await expectHabit(exactHabit, rewrite('habit', 0).to, {
      color: 'cyan',
      icon: 'moon',
    });
    await expectHabit(
      editedAffirmation,
      {
        ...rewrite('habit', 1).from,
        affirmation: 'I changed this line.',
      },
      { color: 'emerald', icon: 'flame' },
    );
    await expectHabit(exactMove, rewrite('habit', 1).to, {
      color: 'emerald',
      icon: 'flame',
    });
    await expectHabit(exactRead, rewrite('habit', 2).to, {
      color: 'violet',
      icon: 'book',
    });

    await expectTask(exactTask, rewrite('task', 0).to, TaskPriority.HIGH);
    await expectTask(
      editedTask,
      {
        title: rewrite('task', 1).from.title,
        description: 'Open Notes and write a single line that is truly mine.',
      },
      TaskPriority.MEDIUM,
    );
    await expectTask(exactCapture, rewrite('task', 1).to, TaskPriority.MEDIUM);
    await expectTask(
      unchangedTask,
      {
        title: 'Forge your first Contract',
        description:
          'Head to Contracts and commit to one small thing, daily. Watch the streak grow.',
      },
      TaskPriority.LOW,
    );

    const reloaded = await dataSource.getRepository(Note).findOneByOrFail({
      id: exactIdea.id,
    });
    reloaded.content = 'I rewrote this after the update.';
    await dataSource.getRepository(Note).save(reloaded);
    const beforeDown = await timestamps();
    await run('down');
    expect(await timestamps()).toBe(beforeDown);

    await expectNote(exactNote, rewrite('notes', 0).from, { isPinned: true });
    await expectNote(exactThought, rewrite('notes', 1).from);
    await expectNote(reloaded, {
      title: rewrite('notes', 2).to.title,
      content: 'I rewrote this after the update.',
    });
    await expectHabit(exactHabit, rewrite('habit', 0).from, {
      color: 'cyan',
      icon: 'moon',
    });
    await expectHabit(
      editedAffirmation,
      {
        ...rewrite('habit', 1).from,
        affirmation: 'I changed this line.',
      },
      { color: 'emerald', icon: 'flame' },
    );
    await expectHabit(exactMove, rewrite('habit', 1).from, {
      color: 'emerald',
      icon: 'flame',
    });
    await expectTask(exactTask, rewrite('task', 0).from, TaskPriority.HIGH);
    await expectTask(
      exactCapture,
      rewrite('task', 1).from,
      TaskPriority.MEDIUM,
    );
    await expectTask(
      unchangedTask,
      {
        title: 'Forge your first Contract',
        description:
          'Head to Contracts and commit to one small thing, daily. Watch the streak grow.',
      },
      TaskPriority.LOW,
    );
  });

  function rewrite(table: 'notes' | 'habit' | 'task', index: number) {
    const matches = onboardingSampleRewrites.filter(
      (item) => item.table === table,
    );
    return matches[index];
  }

  async function user(username: string): Promise<User> {
    return dataSource.getRepository(User).save({
      username,
      email: `${username}@example.test`,
      password: 'synthetic-hash',
    });
  }

  async function note(
    owner: User,
    copy: SampleRewrite['from'],
    extra: { isPinned?: boolean } = {},
  ): Promise<Note> {
    return dataSource.getRepository(Note).save({
      title: copy.title,
      content: copy.content,
      userId: owner.id,
      isPinned: extra.isPinned ?? false,
    });
  }

  async function habit(
    owner: User,
    copy: SampleRewrite['from'],
    extra: { color: string; icon: string },
  ): Promise<Habit> {
    return dataSource.getRepository(Habit).save({
      ...copy,
      ...extra,
      frequency: HabitFrequency.DAILY,
      userId: owner.id,
    });
  }

  async function task(
    owner: User,
    copy: SampleRewrite['from'],
    priority: TaskPriority,
  ): Promise<Task> {
    return dataSource.getRepository(Task).save({
      ...copy,
      priority,
      userId: owner.id,
    });
  }

  async function freezeTimestamps(): Promise<void> {
    for (const table of ['notes', 'habit', 'task']) {
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
    copy: SampleRewrite['from'],
    extra: { isPinned?: boolean } = {},
  ): Promise<void> {
    const row = await dataSource
      .getRepository(Note)
      .findOneByOrFail({ id: saved.id });
    expect(row.title).toBe(copy.title);
    expect(row.content).toBe(copy.content);
    expect(row.userId).toBe(saved.userId);
    expect(row.isPinned).toBe(extra.isPinned ?? saved.isPinned);
  }

  async function expectHabit(
    saved: Habit,
    copy: SampleRewrite['from'],
    extra: { color: string; icon: string },
  ): Promise<void> {
    const row = await dataSource
      .getRepository(Habit)
      .findOneByOrFail({ id: saved.id });
    expect(row.name).toBe(copy.name);
    expect(row.description).toBe(copy.description);
    expect(row.intent).toBe(copy.intent);
    expect(row.affirmation).toBe(copy.affirmation);
    expect(row.color).toBe(extra.color);
    expect(row.icon).toBe(extra.icon);
    expect(row.frequency).toBe(HabitFrequency.DAILY);
    expect(row.userId).toBe(saved.userId);
  }

  async function expectTask(
    saved: Task,
    copy: SampleRewrite['from'],
    priority: TaskPriority,
  ): Promise<void> {
    const row = await dataSource
      .getRepository(Task)
      .findOneByOrFail({ id: saved.id });
    expect(row.title).toBe(copy.title);
    expect(row.description).toBe(copy.description);
    expect(row.priority).toBe(priority);
    expect(row.userId).toBe(saved.userId);
    expect(row.isComplete).toBe(false);
  }

  async function timestamps(): Promise<string> {
    const [notes, habits, tasks] = await Promise.all([
      dataSource.getRepository(Note).find({ order: { id: 'ASC' } }),
      dataSource.getRepository(Habit).find({ order: { id: 'ASC' } }),
      dataSource.getRepository(Task).find({ order: { id: 'ASC' } }),
    ]);
    return JSON.stringify({
      notes: notes.map((row) => [row.id, row.updatedAt.getTime()]),
      habits: habits.map((row) => [row.id, row.updatedAt.getTime()]),
      tasks: tasks.map((row) => [row.id, row.updatedAt.getTime()]),
    });
  }
});

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
    throw new Error('pg_ctl start failed');
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

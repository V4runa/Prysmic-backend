import { Repository } from 'typeorm';
import { HabitFrequency } from '../../enums/habit-frequency.enum';
import { onboardingSampleRewrites } from '../../migrations/1790700000000-RewriteOnboardingSampleCopy';
import {
  gratitudeSampleNote,
  somedaySampleNote,
  somedaySampleTask,
} from '../../migrations/1790800000000-UseOnboardingStarterTags';
import { Habit } from '../habits/habit.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Task, TaskPriority } from '../tasks/tasks.entity';
import { OnboardingService } from './onboarding.service';

/**
 * The migration rewrites a row only when it still equals these strings.
 * They are the sample copy this service used to insert at signup.
 */
const ORIGINAL_NOTES = [
  {
    title: '\u2726 Start Here',
    content: [
      'Welcome, wanderer.',
      '',
      'Prysmic is an extension to your cognition — a calm place to set down what ' +
        'your mind would rather not carry alone. Here is the lay of the land:',
      '',
      '\u2022 Notes — capture thoughts the moment they arrive. This very note is one.',
      '\u2022 Tag Codex — give your notes color and meaning so you can find a single ' +
        'thread later. The tags on these samples are a starting palette.',
      '\u2022 Contracts — your habits, framed as quiet promises to yourself. Each ' +
        'check-in grows a streak.',
      '\u2022 Tasks — the things that need doing, sorted by what matters most.',
      '\u2022 Moods — a gentle daily check-in with how you actually feel.',
      '',
      'Everything you see right now is a sample, placed here to show you around. ' +
        'None of it is precious. Edit it, retag it, or delete it entirely — the ' +
        'space is yours.',
      '',
      'When you are ready, capture your first real thought. We will be here.',
    ].join('\n'),
  },
  {
    title: 'A thought worth keeping',
    content:
      'The mind is for having ideas, not holding them. The moment a ' +
      'thought feels worth keeping, give it a home here — then let it go ' +
      'from your head.\n\nTry it now: edit this note, or tag it ' +
      'differently. Nothing here is precious. It is yours to reshape.',
  },
  {
    title: 'Ideas are fragile things',
    content:
      'Half-formed ideas evaporate if you wait for them to be perfect. ' +
      'Capture the spark, not the finished flame.\n\nThis note is tagged ' +
      '"Ideas" — visit the Tag Codex to see how tags let you filter the ' +
      'noise down to a single thread of thought.',
  },
];

const ORIGINAL_HABITS = [
  {
    name: 'Morning stillness',
    description: 'A few quiet minutes before the day asks anything of me.',
    intent: 'Begin each day from calm rather than from urgency.',
    affirmation: 'I meet the morning on my own terms.',
  },
  {
    name: 'Move the body',
    description: 'Motion of any kind — a walk, a stretch, a full session.',
    intent: 'Honor the body that carries every thought I have.',
    affirmation: 'Movement is a gift I give myself, not a debt I owe.',
  },
  {
    name: 'Read before sleep',
    description:
      'Trade the glow of a screen for a few pages of something real.',
    intent: 'End the day with wonder instead of noise.',
    affirmation: 'I let my last thoughts of the day be chosen, not fed to me.',
  },
];

const ORIGINAL_TASKS = [
  {
    title: 'Make Prysmic yours — edit or delete these samples',
    description:
      'This whole starter set is just a demonstration. Change anything, ' +
      'or clear it all out. The empty space that remains is the point.',
  },
  {
    title: 'Capture one real thought today',
    description: 'Open Notes and write a single line that is truly yours.',
  },
];

function capture<T extends object>() {
  const rows: T[] = [];
  const repo = {
    create: (value: T) => value,
    save: (value: T) => {
      rows.push(value);
      return Promise.resolve(value);
    },
  };
  return { rows, repo: repo as unknown as Repository<T> };
}

describe('OnboardingService sample copy', () => {
  const tags = capture<Tag>();
  const notes = capture<Note>();
  const habits = capture<Habit>();
  const tasks = capture<Task>();

  beforeAll(async () => {
    const service = new OnboardingService(
      tags.repo,
      notes.repo,
      habits.repo,
      tasks.repo,
    );
    await service.seedSampleData(7);
  });

  it('seeds the same notes, contracts, and tasks the migration writes', () => {
    const noteRewrites = onboardingSampleRewrites.filter(
      (rewrite) => rewrite.table === 'notes',
    );
    const habitRewrites = onboardingSampleRewrites.filter(
      (rewrite) => rewrite.table === 'habit',
    );
    const taskRewrites = onboardingSampleRewrites.filter(
      (rewrite) => rewrite.table === 'task',
    );

    expect(notes.rows.map(copyOf)).toEqual([
      noteRewrites[0].to,
      { title: gratitudeSampleNote.title, content: gratitudeSampleNote.to },
      noteRewrites[2].to,
    ]);
    expect(gratitudeSampleNote.title).toBe(noteRewrites[1].to.title);
    expect(gratitudeSampleNote.from).toBe(noteRewrites[1].to.content);
    expect(notes.rows[1].content).toBe(gratitudeSampleNote.to);
    expect(notes.rows[2].content).toBe(somedaySampleNote.content);
    expect(somedaySampleNote.content).toBe(noteRewrites[2].to.content);
    expect(habits.rows.map(copyOf)).toEqual(
      habitRewrites.map((rewrite) => rewrite.to),
    );
    expect(tasks.rows.slice(0, 2).map(copyOf)).toEqual(
      taskRewrites.map((rewrite) => rewrite.to),
    );
    expect(copyOf(tasks.rows[2])).toEqual({
      title: somedaySampleTask.title,
      description: somedaySampleTask.description,
    });
  });

  it('keeps the sample structure: pinned welcome, tags, colors, and priorities', () => {
    expect(notes.rows.map((note) => note.isPinned)).toEqual([
      true,
      false,
      false,
    ]);
    expect(notes.rows.map((note) => note.tags.map((tag) => tag.name))).toEqual([
      ['Reflections'],
      ['Reflections', 'Gratitude'],
      ['Ideas', 'Someday'],
    ]);
    expect(
      tasks.rows.map((task) => (task.tags ?? []).map((tag) => tag.name)),
    ).toEqual([[], [], ['Someday']]);
    expect(
      tags.rows.map((tag) => ({ name: tag.name, color: tag.color })),
    ).toEqual([
      { name: 'Reflections', color: 'cyan' },
      { name: 'Ideas', color: 'violet' },
      { name: 'Gratitude', color: 'emerald' },
      { name: 'Someday', color: 'amber' },
    ]);
    expect(
      habits.rows.map((habit) => ({
        color: habit.color,
        icon: habit.icon,
        frequency: habit.frequency,
      })),
    ).toEqual([
      { color: 'cyan', icon: 'moon', frequency: HabitFrequency.DAILY },
      { color: 'emerald', icon: 'flame', frequency: HabitFrequency.DAILY },
      { color: 'violet', icon: 'book', frequency: HabitFrequency.DAILY },
    ]);
    expect(tasks.rows.map((task) => task.priority)).toEqual([
      TaskPriority.HIGH,
      TaskPriority.MEDIUM,
      TaskPriority.LOW,
    ]);
    expect(notes.rows[0].content.startsWith('Welcome, wanderer.\n')).toBe(true);
  });

  it('matches the previous seed exactly, and only rewrites rows that changed', () => {
    expect(fromTable('notes')).toEqual(ORIGINAL_NOTES);
    expect(fromTable('habit')).toEqual(ORIGINAL_HABITS);
    expect(fromTable('task')).toEqual(ORIGINAL_TASKS);
    for (const rewrite of onboardingSampleRewrites) {
      expect(rewrite.from).not.toEqual(rewrite.to);
    }
    expect(
      onboardingSampleRewrites.some(
        (rewrite) => rewrite.from.title === 'Forge your first Contract',
      ),
    ).toBe(false);
  });

  it('does not seed the old sentimental lines', () => {
    const visible = [
      ...notes.rows.flatMap((note) => [note.title, note.content]),
      ...habits.rows.flatMap((habit) => [
        habit.name,
        habit.description,
        habit.intent,
        habit.affirmation,
      ]),
      ...tasks.rows.flatMap((task) => [task.title, task.description]),
    ].join('\n');

    expect(visible).not.toContain('carry alone');
    expect(visible).not.toContain('not holding them');
    expect(visible).not.toContain('Nothing here is precious');
    expect(visible).not.toContain('fragile');
    expect(visible).not.toContain('finished flame');
    expect(visible).not.toContain('Honor the body');
    expect(visible).not.toContain('debt I owe');
    expect(visible).not.toContain('empty space that remains');
    expect(visible).not.toContain('truly yours');
    expect(visible).not.toContain('End the day with wonder');
    expect(visible).not.toContain('asks anything of me');
    expect(visible).not.toContain('grateful');
    expect(visible).not.toContain('thankful');
  });

  it('attaches every starter tag to at least one note or task', () => {
    const onNotes = notes.rows.flatMap((note) =>
      note.tags.map((tag) => tag.name),
    );
    const onTasks = tasks.rows.flatMap((task) =>
      (task.tags ?? []).map((tag) => tag.name),
    );
    const used = new Set([...onNotes, ...onTasks]);

    expect(tags.rows.length).toBeGreaterThan(0);
    for (const tag of tags.rows) {
      expect(used.has(tag.name)).toBe(true);
    }
    expect(onNotes).toContain('Gratitude');
    expect(onNotes).toContain('Someday');
    expect(onTasks).toContain('Someday');
  });
});

function copyOf(row: {
  title?: string;
  content?: string;
  name?: string;
  description?: string;
  intent?: string;
  affirmation?: string;
}): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const key of [
    'title',
    'content',
    'name',
    'description',
    'intent',
    'affirmation',
  ] as const) {
    const value = row[key];
    if (typeof value === 'string') copy[key] = value;
  }
  return copy;
}

function fromTable(
  table: 'notes' | 'habit' | 'task',
): Record<string, string>[] {
  return onboardingSampleRewrites
    .filter((rewrite) => rewrite.table === table)
    .map((rewrite) => rewrite.from);
}

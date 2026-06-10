import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../tags/tags.entity';
import { Note } from '../notes/notes.entity';
import { Habit } from '../habits/habit.entity';
import { Task, TaskPriority } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import { HabitFrequency } from '../../enums/habit-frequency.enum';

/**
 * Seeds a curated, on-brand starter workspace for a freshly registered user.
 *
 * The goal is twofold: every feature should feel alive on first load (no empty
 * voids), and the sample content itself should gently teach how Prysmic fits
 * together. All records are real and fully editable — the welcome note invites
 * the wanderer to reshape or clear them whenever they're ready.
 *
 * This is intentionally best-effort: a seeding failure must never block the
 * signup that triggered it, so the orchestrator swallows and logs errors. It
 * writes through repositories directly to avoid coupling AuthModule to the
 * feature modules (which would form a circular dependency).
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(Tag) private readonly tagRepo: Repository<Tag>,
    @InjectRepository(Note) private readonly noteRepo: Repository<Note>,
    @InjectRepository(Habit) private readonly habitRepo: Repository<Habit>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
  ) {}

  async seedSampleData(userId: number): Promise<void> {
    try {
      const tags = await this.seedTags(userId);
      await this.seedNotes(userId, tags);
      await this.seedHabits(userId);
      await this.seedTasks(userId);
    } catch (err) {
      // Never let onboarding seeding break the signup flow.
      this.logger.error(
        `Failed to seed sample data for user ${userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private userRef(userId: number): User {
    // Lightweight reference so TypeORM sets the FK without loading the row.
    return { id: userId } as User;
  }

  private async seedTags(userId: number): Promise<Record<string, Tag>> {
    const definitions: { key: string; name: string; color: string }[] = [
      { key: 'reflections', name: 'Reflections', color: 'cyan' },
      { key: 'ideas', name: 'Ideas', color: 'violet' },
      { key: 'gratitude', name: 'Gratitude', color: 'emerald' },
      { key: 'someday', name: 'Someday', color: 'amber' },
    ];

    const tags: Record<string, Tag> = {};
    for (const def of definitions) {
      try {
        const tag = this.tagRepo.create({
          name: def.name,
          color: def.color,
          user: this.userRef(userId),
        });
        tags[def.key] = await this.tagRepo.save(tag);
      } catch (err) {
        this.logger.warn(
          `Skipped seed tag "${def.name}" for user ${userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return tags;
  }

  private async seedNotes(
    userId: number,
    tags: Record<string, Tag>,
  ): Promise<void> {
    const notes: {
      title: string;
      content: string;
      tagKeys: string[];
      isPinned?: boolean;
    }[] = [
      {
        title: '\u2726 Start Here',
        content: START_HERE_CONTENT,
        tagKeys: ['reflections'],
        isPinned: true,
      },
      {
        title: 'A thought worth keeping',
        content:
          'The mind is for having ideas, not holding them. The moment a ' +
          'thought feels worth keeping, give it a home here — then let it go ' +
          'from your head.\n\nTry it now: edit this note, or tag it ' +
          'differently. Nothing here is precious. It is yours to reshape.',
        tagKeys: ['reflections'],
      },
      {
        title: 'Ideas are fragile things',
        content:
          'Half-formed ideas evaporate if you wait for them to be perfect. ' +
          'Capture the spark, not the finished flame.\n\nThis note is tagged ' +
          '"Ideas" — visit the Tag Codex to see how tags let you filter the ' +
          'noise down to a single thread of thought.',
        tagKeys: ['ideas'],
      },
    ];

    for (const def of notes) {
      try {
        const note = this.noteRepo.create({
          title: def.title,
          content: def.content,
          userId,
          user: this.userRef(userId),
          isPinned: def.isPinned ?? false,
          tags: def.tagKeys
            .map((key) => tags[key])
            .filter((t): t is Tag => Boolean(t)),
        });
        await this.noteRepo.save(note);
      } catch (err) {
        this.logger.warn(
          `Skipped seed note "${def.title}" for user ${userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async seedHabits(userId: number): Promise<void> {
    const habits: Partial<Habit>[] = [
      {
        name: 'Morning stillness',
        description: 'A few quiet minutes before the day asks anything of me.',
        intent: 'Begin each day from calm rather than from urgency.',
        affirmation: 'I meet the morning on my own terms.',
        color: 'cyan',
        icon: 'moon',
        frequency: HabitFrequency.DAILY,
      },
      {
        name: 'Move the body',
        description: 'Motion of any kind — a walk, a stretch, a full session.',
        intent: 'Honor the body that carries every thought I have.',
        affirmation: 'Movement is a gift I give myself, not a debt I owe.',
        color: 'emerald',
        icon: 'flame',
        frequency: HabitFrequency.DAILY,
      },
      {
        name: 'Read before sleep',
        description:
          'Trade the glow of a screen for a few pages of something real.',
        intent: 'End the day with wonder instead of noise.',
        affirmation:
          'I let my last thoughts of the day be chosen, not fed to me.',
        color: 'violet',
        icon: 'book',
        frequency: HabitFrequency.DAILY,
      },
    ];

    for (const def of habits) {
      try {
        const habit = this.habitRepo.create({ ...def, userId });
        await this.habitRepo.save(habit);
      } catch (err) {
        this.logger.warn(
          `Skipped seed contract "${def.name}" for user ${userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async seedTasks(userId: number): Promise<void> {
    const tasks: { title: string; description: string; priority: TaskPriority }[] =
      [
        {
          title: 'Make Prysmic yours — edit or delete these samples',
          description:
            'This whole starter set is just a demonstration. Change anything, ' +
            'or clear it all out. The empty space that remains is the point.',
          priority: TaskPriority.HIGH,
        },
        {
          title: 'Capture one real thought today',
          description: 'Open Notes and write a single line that is truly yours.',
          priority: TaskPriority.MEDIUM,
        },
        {
          title: 'Forge your first Contract',
          description:
            'Head to Contracts and commit to one small thing, daily. Watch ' +
            'the streak grow.',
          priority: TaskPriority.LOW,
        },
      ];

    for (const def of tasks) {
      try {
        const task = this.taskRepo.create({
          title: def.title,
          description: def.description,
          priority: def.priority,
          userId,
          user: this.userRef(userId),
        });
        await this.taskRepo.save(task);
      } catch (err) {
        this.logger.warn(
          `Skipped seed task "${def.title}" for user ${userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}

const START_HERE_CONTENT = [
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
].join('\n');

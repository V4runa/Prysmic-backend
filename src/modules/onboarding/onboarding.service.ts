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
 * Seeds starter notes, tags, contracts, and tasks for a newly registered user.
 *
 * The samples are real rows. They show how those features fit together, and
 * the user can edit or delete any of them.
 *
 * Seeding is best-effort: a failure must never block signup, so errors are
 * logged and swallowed. Writes go through repositories directly to avoid
 * coupling AuthModule to the feature modules (which would form a circular
 * dependency).
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
          'When an idea feels worth keeping, write it down here so you can ' +
          'find it later.\n\nTry it now: edit this note, or tag it ' +
          'differently. These samples are yours to change or delete.',
        tagKeys: ['reflections'],
      },
      {
        title: "An idea I'm still working on",
        content:
          "You don't need a finished thought to start a note. Write the " +
          'idea down as it is.\n\nThis note is tagged Ideas — open the Tag ' +
          'Codex to see how tags help you find notes later.',
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
        name: 'Morning pause',
        description: 'A few quiet minutes at the start of the day.',
        intent: 'Start the day before jumping into everything else.',
        affirmation: 'I can take a few minutes for myself this morning.',
        color: 'cyan',
        icon: 'moon',
        frequency: HabitFrequency.DAILY,
      },
      {
        name: 'Move the body',
        description: 'A walk, a stretch, or a workout — whatever fits the day.',
        intent: 'Get some movement in each day.',
        affirmation: 'A little movement is enough.',
        color: 'emerald',
        icon: 'flame',
        frequency: HabitFrequency.DAILY,
      },
      {
        name: 'Read before sleep',
        description: 'Read a few pages before bed instead of scrolling.',
        intent: 'Wind down with a book at the end of the day.',
        affirmation: 'I can choose how the day ends.',
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
    const tasks: {
      title: string;
      description: string;
      priority: TaskPriority;
    }[] = [
      {
        title: 'Make Prysmic yours — edit or delete these samples',
        description:
          'This starter set is just a demonstration. Change anything, or clear it all out.',
        priority: TaskPriority.HIGH,
      },
      {
        title: 'Capture one real thought today',
        description: 'Open Notes and write something of your own.',
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
  'Prysmic is a place to keep your notes, moods, and the commitments you ' +
    "want to follow through on. Here's what's here:",
  '',
  '\u2022 Notes — write down ideas and thoughts, and come back to them later. This note is one of them.',
  '\u2022 Tag Codex — create your own tags so you can organize notes and find them again. The tags on these samples are a starting set.',
  '\u2022 Contracts — habits framed as personal commitments, with check-ins and streaks.',
  '\u2022 Tasks — things you need to do, organized by what matters most.',
  '\u2022 Moods — check in with how you feel, and see it next to the rest of your day.',
  '',
  'Everything you see right now is a sample, so you can look around. Edit ' +
    "it, retag it, or delete it — it's yours.",
  '',
  "When you're ready, write your first real note.",
].join('\n');

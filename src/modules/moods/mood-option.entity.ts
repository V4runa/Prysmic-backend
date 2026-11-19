// src/modules/moods/mood-option.entity.ts

import { Exclude } from 'class-transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * A user-customizable mood in the picker's palette (mirrors how Tags work).
 * Mood *entries* snapshot the label/emoji/color at save time, so editing or
 * deleting an option never rewrites a user's history.
 */
@Entity('mood_options')
@Unique(['user', 'label'])
export class MoodOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40 })
  label: string;

  @Column({ type: 'varchar', length: 16 })
  emoji: string;

  // A palette color token (e.g. "amber", "cyan"), resolved to Tailwind classes
  // on the client. Stored as a token rather than raw classes for portability.
  @Column({ type: 'varchar', length: 24 })
  color: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @Exclude()
  @ManyToOne(() => User, (user) => user.moodOptions, { onDelete: 'CASCADE' })
  user: User;
}

/**
 * Default palette seeded when an account has no mood options yet.
 * Order is the picker order. A palette that already has any mood is left
 * alone, so these additions are not inserted into existing lists.
 * Colors are tokens the client already knows how to paint.
 */
export const DEFAULT_MOOD_OPTIONS: ReadonlyArray<{
  label: string;
  emoji: string;
  color: string;
}> = [
  { label: 'Joyful', emoji: '☀️', color: 'amber' },
  { label: 'Content', emoji: '🍃', color: 'emerald' },
  { label: 'Calm', emoji: '🌊', color: 'cyan' },
  { label: 'Focused', emoji: '🎯', color: 'blue' },
  { label: 'Tired', emoji: '🌙', color: 'violet' },
  { label: 'Anxious', emoji: '🌪️', color: 'rose' },
  { label: 'Inspired', emoji: '🔮', color: 'emerald' },
  { label: 'Reflective', emoji: '🪞', color: 'slate' },
  { label: 'Grateful', emoji: '🕊️', color: 'yellow' },
  { label: 'Lonely', emoji: '🌫️', color: 'slate' },
  { label: 'Angry', emoji: '🔥', color: 'red' },
  { label: 'Hopeful', emoji: '🌈', color: 'fuchsia' },
];

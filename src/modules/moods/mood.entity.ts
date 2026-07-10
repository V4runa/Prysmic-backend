// src/modules/moods/mood.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
export class Mood {
  @PrimaryGeneratedColumn()
  id: number;

  // Snapshot of the chosen mood's label at save time (e.g. "Joyful" or a custom
  // name). Widened to fit custom labels; history is never rewritten on edits.
  @Column({ type: 'varchar', length: 40 })
  moodType: string;

  @Column({ type: 'varchar', length: 16 })
  emoji: string;

  // Snapshot of the chosen mood's palette color token. Nullable for legacy
  // entries created before custom moods (resolved via a fallback on the client).
  @Column({ type: 'varchar', length: 24, nullable: true })
  color?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  // The user's local calendar day (YYYY-MM-DD) this mood belongs to. Stored
  // separately from createdAt so "one mood per day" buckets by the user's
  // timezone rather than the server's UTC clock.
  @Column({ type: 'date' })
  date: string;

  // True when the entry was added retroactively (e.g. filling in a past day via
  // the calendar). Backfilled moods still appear on the timeline/calendar but are
  // excluded from streak counts so backfilling can't manufacture a streak.
  @Column({ type: 'boolean', default: false })
  backfilled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.moods, { onDelete: 'CASCADE' })
  user: User;
}

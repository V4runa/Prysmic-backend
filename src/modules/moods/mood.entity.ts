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

  @Column({ type: 'varchar', length: 24 })
  moodType: string;

  @Column({ type: 'varchar', length: 10 })
  emoji: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  // The user's local calendar day (YYYY-MM-DD) this mood belongs to. Stored
  // separately from createdAt so "one mood per day" buckets by the user's
  // timezone rather than the server's UTC clock.
  @Column({ type: 'date' })
  date: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.moods, { onDelete: 'CASCADE' })
  user: User;
}

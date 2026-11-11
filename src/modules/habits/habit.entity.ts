import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { HabitCheck } from './habit-check.entity';
import { Note } from '../notes/notes.entity';
import { HabitFrequency } from '../../enums/habit-frequency.enum';

@Entity()
export class Habit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  intent?: string;

  @Column({ nullable: true })
  affirmation?: string;

  @Column({ default: 'cyan' })
  color: string;

  @Column({ nullable: true })
  icon?: string;

  @Column({ type: 'enum', enum: HabitFrequency, default: HabitFrequency.DAILY })
  frequency: HabitFrequency;

  @ManyToOne(() => Note, (note) => note.habitsThatOriginatedHere, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'originNoteId' })
  originNote?: Note | null;

  /** FK column for originNote. Null when the habit has no source note. */
  @Column({ nullable: true })
  originNoteId?: number | null;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.habits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: false })
  userId: number;

  @OneToMany(() => HabitCheck, (check) => check.habit)
  checks: HabitCheck[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

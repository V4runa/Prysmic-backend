import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Unique,
  JoinColumn,
} from 'typeorm';
import { Habit } from './habit.entity';

@Entity()
@Unique(['habit', 'date'])
export class HabitCheck {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Habit, (habit) => habit.checks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'habitId' })
  habit: Habit;

  @Column({ type: 'date' })
  date: string;

  @CreateDateColumn()
  createdAt: Date;
}

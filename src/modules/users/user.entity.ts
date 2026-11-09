import { Exclude } from 'class-transformer';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Habit } from '../habits/habit.entity';
import { Task } from '../tasks/tasks.entity';
import { Mood } from '../moods/mood.entity';
import { MoodOption } from '../moods/mood-option.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  /** False until the address is confirmed. Existing rows are grandfathered true. */
  @Column({ default: false })
  emailVerified: boolean;

  /**
   * Incremented when the password changes. Access tokens carry the same
   * number and stop matching afterwards. Hidden from API responses.
   */
  @Column({ default: 0 })
  @Exclude()
  sessionVersion: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @OneToMany(() => Note, (note) => note.user)
  notes: Note[];

  @OneToMany(() => Tag, (tag) => tag.user)
  tags: Tag[];

  @OneToMany(() => Habit, (habit) => habit.user)
  habits: Habit[];

  @OneToMany(() => Task, (task) => task.user)
  tasks: Task[];

  @OneToMany(() => Mood, (mood) => mood.user)
  moods: Mood[];

  @OneToMany(() => MoodOption, (option) => option.user)
  moodOptions: MoodOption[];
}

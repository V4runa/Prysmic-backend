import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Tag } from '../tags/tags.entity';
import { User } from '../users/user.entity';
import { Habit } from '../habits/habit.entity';

@Entity('notes')
export class Note {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: false })
  isPinned: boolean;

  @Column({ default: false })
  isArchived: boolean;

  @ManyToMany(() => Tag, (tag) => tag.notes, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  @JoinTable({ name: 'note_tags' })
  tags: Tag[];

  @ManyToOne(() => User, (user) => user.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: false })
  userId: number;

  @OneToMany(() => Habit, (habit) => habit.originNote)
  habitsThatOriginatedHere: Habit[];
}

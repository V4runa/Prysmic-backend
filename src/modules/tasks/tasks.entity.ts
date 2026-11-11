import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Tag } from '../tags/tags.entity';
import { Note } from '../notes/notes.entity';

export enum TaskPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
}

@Entity('task')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: false })
  isComplete: boolean;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Column({ type: 'timestamp', nullable: true })
  dueDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @ManyToOne(() => Note, (note) => note.tasksThatOriginatedHere, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'originNoteId' })
  originNote?: Note | null;

  /** FK column for originNote. Null when the task has no source note. */
  @Column({ nullable: true })
  originNoteId?: number | null;

  @ManyToMany(() => Tag, { nullable: true })
  @JoinTable({
    name: 'task_tags',
    joinColumn: {
      name: 'taskId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'tagsId',
      referencedColumnName: 'id',
    },
  })
  tags?: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

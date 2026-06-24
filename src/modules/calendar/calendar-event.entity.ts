import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { CalendarRecurrence } from '../../enums/calendar-recurrence.enum';
import { CalendarLinkType } from '../../enums/calendar-link-type.enum';

/**
 * A first-class calendar event owned by the Calendar module.
 *
 * Timezone model: everything is stored as the user's local wall-clock time to
 * stay drift-free and consistent with the rest of Prysmic (mood/habit-check
 * already store local `date` strings). All-day events use `startDate`/`endDate`
 * only; timed events additionally carry `startTime`/`endTime`. We deliberately
 * avoid UTC timestamps so a "9:00 AM" event never shifts across days.
 *
 * Recurrence is stored as a rule (preset + optional end) and expanded on read
 * within the requested range; we never materialise occurrence rows. v1 edits
 * and deletes apply to the whole series.
 */
@Entity('calendar_event')
@Index(['userId', 'startDate'])
export class CalendarEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ default: true })
  allDay: boolean;

  /** Local start day (YYYY-MM-DD). Always present; anchors grid placement. */
  @Column({ type: 'date' })
  startDate: string;

  /** Local end day (YYYY-MM-DD), inclusive. Null means a single-day event. */
  @Column({ type: 'date', nullable: true })
  endDate?: string | null;

  /** Local start time (HH:MM:SS) for timed events; null when all-day. */
  @Column({ type: 'time', nullable: true })
  startTime?: string | null;

  /** Local end time (HH:MM:SS) for timed events; null when all-day. */
  @Column({ type: 'time', nullable: true })
  endTime?: string | null;

  @Column({ default: 'cyan' })
  color: string;

  @Column({ nullable: true })
  location?: string | null;

  @Column({
    type: 'enum',
    enum: CalendarRecurrence,
    default: CalendarRecurrence.NONE,
  })
  recurrence: CalendarRecurrence;

  /** Local day (YYYY-MM-DD) the recurrence stops; null means it repeats forever. */
  @Column({ type: 'date', nullable: true })
  recurrenceEndDate?: string | null;

  /** Soft reference to a linked entity (see CalendarLinkType). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  linkedType?: CalendarLinkType | null;

  @Column({ type: 'int', nullable: true })
  linkedId?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

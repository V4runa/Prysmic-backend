import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Note } from './notes.entity';
import { User } from '../users/user.entity';

/**
 * A file (image or document) attached to a note. Bytes are stored inline as
 * `bytea` — deliberately simple for the current low-volume use, and hidden
 * behind the service layer so the store can move to object storage later
 * without touching callers. The `data` column is not selected by default so
 * listing attachments stays cheap; the raw endpoint opts in explicitly.
 */
@Entity('note_attachments')
@Index(['noteId'])
export class NoteAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  noteId: number;

  @ManyToOne(() => Note, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'noteId' })
  note: Note;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Original filename as uploaded (used for display + download). */
  @Column()
  filename: string;

  /** Canonical MIME type we resolved and stored under. */
  @Column()
  mimeType: string;

  /** Byte length of `data`. */
  @Column({ type: 'int' })
  size: number;

  /** Raw bytes. Excluded from default selects; opt in via query builder. */
  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @CreateDateColumn()
  createdAt: Date;
}

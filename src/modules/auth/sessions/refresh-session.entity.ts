import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One link in a refresh-token family. A login starts a family. Each refresh
 * marks the presented row rotated and inserts the successor in the same family.
 * For a short grace window the rotated row also holds a sealed copy of that
 * successor, so a concurrent refresh can be given the current cookie. Reuse
 * after the window revokes the family.
 */
@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_userId', ['userId'])
@Index('IDX_refresh_tokens_familyId', ['familyId'])
export class RefreshSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 36 })
  familyId: string;

  /** SHA-256 hex of the raw token. */
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  /**
   * AES-GCM seal of the successor raw token. Set when this row is rotated
   * and cleared once the reuse grace window has passed.
   */
  @Column({ type: 'text', nullable: true })
  successorSeal: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

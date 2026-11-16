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
 * Reuse of a rotated row revokes the family. Only the SHA-256 of the raw
 * token is stored.
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

  /** SHA-256 hex of the raw token. The raw token is never stored. */
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

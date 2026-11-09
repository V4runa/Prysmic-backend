import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AuthTokenPurpose } from '../account.constants';

@Entity('auth_tokens')
@Index('IDX_auth_tokens_user_purpose', ['userId', 'purpose'])
export class AuthToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ type: 'varchar' })
  purpose: AuthTokenPurpose;

  /** SHA-256 hex of the raw token. The raw token is never stored. */
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

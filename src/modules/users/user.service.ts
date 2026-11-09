import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto, UpdateUserDto } from '../../dtos/user';
import { AuthToken } from '../auth/tokens/auth-token.entity';
import {
  AUTH_TOKEN_PURPOSE,
  EMAIL_CHANGE_PASSWORD_REQUIRED,
  INVALID_CREDENTIALS,
} from '../auth/account.constants';
import { rowsFromQuery } from '../../database/query-rows';
import { AuthRateLimiter } from '../auth/rate-limit';

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserUpdateResult {
  user: User;
  emailChanged: boolean;
}

export interface PasswordChangeResult {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  sessionVersion: number;
}

/** Fields safe to send to a client. Password and relations stay off the wire. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified === true,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuthToken)
    private authTokens: Repository<AuthToken>,
    @Inject(forwardRef(() => AuthRateLimiter))
    private readonly rateLimiter: AuthRateLimiter,
  ) {}

  // Stores the password it is given. Auth signup hashes before calling this.
  async create(createUserDto: CreateUserDto): Promise<User> {
    const { password, email, username } = createUserDto;
    const user = this.userRepository.create({
      email,
      username,
      password,
      emailVerified: false,
      sessionVersion: 0,
    });
    return await this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    const matches = await this.findUsersByEmail(email);
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * Case-insensitive email match, capped at two rows. More than one means
   * legacy case-variants share an address; callers must not guess.
   */
  async findUsersByEmail(email: string): Promise<User[]> {
    const trimmed = email.trim();
    const normalized = trimmed.toLowerCase();
    if (typeof this.userRepository.createQueryBuilder === 'function') {
      return this.userRepository
        .createQueryBuilder('user')
        .where('LOWER(user.email) = :email', { email: normalized })
        .orderBy('user.id', 'ASC')
        .limit(2)
        .getMany();
    }
    const exact = await this.userRepository.findOne({
      where: { email: normalized },
    });
    if (exact) return [exact];
    if (trimmed !== normalized) {
      const typed = await this.userRepository.findOne({
        where: { email: trimmed },
      });
      if (typed) return [typed];
    }
    return [];
  }

  async emailTakenBySomeoneElse(
    email: string,
    exceptUserId?: number,
  ): Promise<boolean> {
    const matches = await this.findUsersByEmail(email);
    return matches.some((user) => user.id !== exceptUserId);
  }

  /**
   * True when some other account's username is this email, including a
   * case-only difference. That collision makes login pick the wrong person.
   */
  async usernameCollidesWithEmail(
    email: string,
    exceptUserId?: number,
  ): Promise<boolean> {
    const exact = await this.findByUsername(email);
    if (exact && exact.id !== exceptUserId) return true;
    if (typeof this.userRepository.createQueryBuilder !== 'function') {
      return false;
    }
    const rows = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :username', {
        username: email.trim().toLowerCase(),
      })
      .limit(2)
      .getMany();
    return rows.some((user) => user.id !== exceptUserId);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Username and email only. This does not replace the password hash.
   * A real email change requires the current password, clears verification,
   * and retires unused confirmation links. The caller sends the new letter.
   */
  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    ip = 'unknown',
  ): Promise<UserUpdateResult> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const requestedEmail = updateUserDto.email?.trim().toLowerCase();
    const nextEmail =
      requestedEmail && requestedEmail !== user.email.toLowerCase()
        ? requestedEmail
        : undefined;
    const requestedUsername = updateUserDto.username;
    const nextUsername =
      requestedUsername && requestedUsername !== user.username
        ? requestedUsername
        : undefined;

    if (nextEmail) {
      await this.assertCurrentPassword(user, updateUserDto.currentPassword, ip);
      if (await this.emailTakenBySomeoneElse(nextEmail, user.id)) {
        throw new ConflictException('Email already in use!');
      }
      if (await this.usernameCollidesWithEmail(nextEmail, user.id)) {
        throw new ConflictException('Email already in use!');
      }
    }

    if (nextUsername) {
      const taken = await this.findByUsername(nextUsername);
      if (taken && taken.id !== user.id) {
        throw new ConflictException('Username already taken!');
      }
      if (await this.emailTakenBySomeoneElse(nextUsername, user.id)) {
        throw new ConflictException('Username already taken!');
      }
    }

    const emailChanged = nextEmail !== undefined;
    if (nextEmail) {
      user.email = nextEmail;
      user.emailVerified = false;
    }
    if (nextUsername) {
      user.username = nextUsername;
    }

    const saved = await this.userRepository.save(user);
    if (emailChanged) {
      await this.revokeVerificationTokens(saved.id);
    }
    return { user: saved, emailChanged };
  }

  /**
   * Atomic password replacement for a signed-in change. Does not touch
   * emailVerified: a reset link proves the mailbox, this path does not.
   */
  async changePasswordHash(
    userId: number,
    passwordHash: string,
  ): Promise<PasswordChangeResult | null> {
    const updated = rowsFromQuery<PasswordChangeResult>(
      await this.userRepository.manager.query(
        `UPDATE "users"
         SET "password" = $1,
             "sessionVersion" = "sessionVersion" + 1,
             "updatedAt" = NOW()
         WHERE "id" = $2
         RETURNING "id", "username", "email", "emailVerified", "sessionVersion"`,
        [passwordHash, userId],
      ),
    );
    const row = updated[0];
    if (!row) return null;
    const sessionVersion = Number(row.sessionVersion);
    return {
      id: Number(row.id),
      username: row.username,
      email: row.email,
      emailVerified: row.emailVerified === true,
      sessionVersion: Number.isInteger(sessionVersion) ? sessionVersion : 0,
    };
  }

  async markEmailVerified(
    manager: EntityManager,
    userId: number,
  ): Promise<boolean> {
    const updated = rowsFromQuery<{ id: number }>(
      await manager.query(
        `UPDATE "users" SET "emailVerified" = true, "updatedAt" = NOW() WHERE "id" = $1 RETURNING "id"`,
        [userId],
      ),
    );
    return updated.length > 0;
  }

  async replacePasswordHash(
    manager: EntityManager,
    userId: number,
    passwordHash: string,
  ): Promise<boolean> {
    const updated = rowsFromQuery<{ id: number }>(
      await manager.query(
        `UPDATE "users"
         SET "password" = $1,
             "sessionVersion" = "sessionVersion" + 1,
             "emailVerified" = true,
             "updatedAt" = NOW()
         WHERE "id" = $2
         RETURNING "id"`,
        [passwordHash, userId],
      ),
    );
    return updated.length > 0;
  }

  private async assertCurrentPassword(
    user: User,
    currentPassword: string | undefined,
    ip: string,
  ): Promise<void> {
    if (!currentPassword) {
      throw new BadRequestException(EMAIL_CHANGE_PASSWORD_REQUIRED);
    }
    this.rateLimiter.assert(
      'email_change',
      user.email.trim().toLowerCase(),
      ip,
    );
    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) throw new UnauthorizedException(INVALID_CREDENTIALS);
  }

  private async revokeVerificationTokens(userId: number): Promise<void> {
    if (typeof this.authTokens.manager?.query !== 'function') return;
    await this.authTokens.manager.query(
      `UPDATE "auth_tokens"
       SET "usedAt" = NOW()
       WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL`,
      [userId, AUTH_TOKEN_PURPOSE.emailVerification],
    );
  }
}

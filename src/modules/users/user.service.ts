import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto, UpdateUserDto } from '../../dtos/user';
import { AuthToken } from '../auth/tokens/auth-token.entity';
import { AUTH_TOKEN_PURPOSE } from '../auth/account.constants';
import { rowsFromQuery } from '../../database/query-rows';

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
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

  // Username and email only. Password is not accepted here, so a profile
  // update cannot replace the hash. A new email clears verification.
  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let emailChanged = false;
    if (updateUserDto.email) {
      const next = updateUserDto.email.trim().toLowerCase();
      if (next !== user.email.toLowerCase()) {
        if (await this.emailTakenBySomeoneElse(next, user.id)) {
          throw new BadRequestException('Could not update profile');
        }
        if (await this.usernameCollidesWithEmail(next, user.id)) {
          throw new BadRequestException('Could not update profile');
        }
        user.email = next;
        user.emailVerified = false;
        emailChanged = true;
      }
    }

    if (updateUserDto.username && updateUserDto.username !== user.username) {
      const taken = await this.findByUsername(updateUserDto.username);
      if (taken && taken.id !== user.id) {
        throw new BadRequestException('Could not update profile');
      }
      if (await this.emailTakenBySomeoneElse(updateUserDto.username, user.id)) {
        throw new BadRequestException('Could not update profile');
      }
      user.username = updateUserDto.username;
    }

    const saved = await this.userRepository.save(user);
    if (emailChanged) {
      await this.revokeVerificationTokens(saved.id);
    }
    return saved;
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

  private async revokeVerificationTokens(userId: number): Promise<void> {
    if (typeof this.authTokens.manager?.query !== 'function') return;
    await this.authTokens.manager.query(
      `UPDATE "auth_tokens"
       SET "usedAt" = NOW()
       WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL`,
      [userId, AUTH_TOKEN_PURPOSE.emailVerification],
    );
  }

  async remove(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.userRepository.remove(user);
  }
}

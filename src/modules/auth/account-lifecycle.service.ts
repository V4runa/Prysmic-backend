import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { purgeAccount } from '../users/purge-account';
import {
  AUTH_TOKEN_PURPOSE,
  EMAIL_UNAVAILABLE,
  INVALID_CREDENTIALS,
  INVALID_LINK,
  PASSWORD_UNCHANGED,
  RESET_TTL_MS,
  VERIFICATION_TTL_MS,
} from './account.constants';
import { EmailDelivery } from './email/email.delivery';
import {
  renderAccountDeletedEmail,
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
  resetLink,
  verificationLink,
} from './email/email.templates';
import { AuthRateLimiter, type RateLimitBucket } from './rate-limit';
import { hashPassword } from './password';
import { assertPasswordAllowed } from './password-policy';
import { AuthTokenService } from './tokens/auth-token.service';

@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);
  private readonly pendingMail = new Set<Promise<void>>();

  constructor(
    private readonly users: UserService,
    private readonly tokens: AuthTokenService,
    private readonly email: EmailDelivery,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Signup path. Does not wait for the provider. A missing mail config is
   * logged and the address stays unverified; signup itself still succeeds.
   */
  sendVerificationEmail(user: User): void {
    if (user.emailVerified) return;
    if (!this.email.isReady()) {
      this.logger.error(
        `Verification email was not sent for user ${user.id}: ${EMAIL_UNAVAILABLE}`,
      );
      return;
    }
    this.dispatch(async () => {
      await this.deliverVerification(user);
    });
  }

  resendVerification(email: string, ip: string): void {
    this.scheduleDelivery('email_resend', email, ip, async (user) => {
      if (!user || user.emailVerified) return;
      await this.deliverVerification(user);
    });
  }

  requestPasswordReset(email: string, ip: string): void {
    this.scheduleDelivery('password_reset', email, ip, async (user) => {
      if (!user) return;
      const raw = await this.tokens.issue(
        user.id,
        AUTH_TOKEN_PURPOSE.passwordReset,
        RESET_TTL_MS,
      );
      const rendered = renderPasswordResetEmail(
        resetLink(this.email.appUrl(), raw),
      );
      await this.email.send({ to: user.email, ...rendered });
    });
  }

  /** Tests wait for letters that were handed off after the HTTP response. */
  async settleMail(): Promise<void> {
    while (this.pendingMail.size > 0) {
      await Promise.allSettled([...this.pendingMail]);
    }
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = requiredToken(rawToken);
    await this.runLink(async (manager) => {
      const userId = await this.tokens.consume(
        manager,
        token,
        AUTH_TOKEN_PURPOSE.emailVerification,
      );
      if (!userId) throw new BadRequestException(INVALID_LINK);
      const verified = await this.users.markEmailVerified(manager, userId);
      if (!verified) throw new BadRequestException(INVALID_LINK);
    });
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const token = requiredToken(rawToken);
    const userId = await this.tokens.peekUserId(
      token,
      AUTH_TOKEN_PURPOSE.passwordReset,
    );
    if (!userId) throw new BadRequestException(INVALID_LINK);
    const user = await this.users.findById(userId);
    if (!user) throw new BadRequestException(INVALID_LINK);
    // Reject before hashing or consuming the link, so the person can try again.
    assertPasswordAllowed(password, {
      email: user.email,
      username: user.username,
    });
    const passwordHash = await hashPassword(password);
    await this.runLink(async (manager) => {
      const consumedId = await this.tokens.consume(
        manager,
        token,
        AUTH_TOKEN_PURPOSE.passwordReset,
      );
      if (!consumedId) throw new BadRequestException(INVALID_LINK);
      const updated = await this.users.replacePasswordHash(
        manager,
        consumedId,
        passwordHash,
      );
      if (!updated) throw new BadRequestException(INVALID_LINK);
      await this.tokens.revokeUnused(
        manager,
        consumedId,
        AUTH_TOKEN_PURPOSE.passwordReset,
      );
    });
  }

  /**
   * Signed-in password replacement. A wrong current password reads the same
   * as a failed login. The new password follows the shared policy and must
   * not be the one already stored. The returned session uses the bumped
   * version so the caller can keep this session and every older token dies.
   * Does not mark the email verified: knowing the password is not proof of
   * the mailbox, unlike a reset link.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ): Promise<{
    id: number;
    username: string;
    email: string;
    emailVerified: boolean;
    sessionVersion: number;
  }> {
    const id = Number(userId);
    if (!Number.isInteger(id)) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const user = await this.users.findById(id);
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS);
    this.rateLimiter.assert(
      'password_change',
      user.email.trim().toLowerCase(),
      ip,
    );
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!passwordMatches) throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (
      newPassword === currentPassword ||
      (await bcrypt.compare(newPassword, user.password))
    ) {
      // bcrypt keeps only the first 72 bytes, so a legacy password and its
      // own prefix still match. That prefix is not a new password.
      throw new BadRequestException(PASSWORD_UNCHANGED);
    }
    assertPasswordAllowed(newPassword, {
      email: user.email,
      username: user.username,
    });
    const passwordHash = await hashPassword(newPassword);
    const updated = await this.users.changePasswordHash(user.id, passwordHash);
    if (!updated) throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (updated.emailVerified) this.sendPasswordChangedEmail(updated.email);
    return updated;
  }

  /**
   * Confirms the current password, then deletes the account and everything
   * it owns. The confirmation letter goes out after the commit, and only
   * when the address was verified. A missing mail config or a delivery
   * failure does not change the outcome of the delete.
   */
  async deleteAccount(
    userId: number,
    password: string,
    ip: string,
  ): Promise<void> {
    const id = Number(userId);
    if (!Number.isInteger(id)) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const user = await this.users.findById(id);
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS);
    this.rateLimiter.assert(
      'account_delete',
      user.email.trim().toLowerCase(),
      ip,
    );
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const email = user.email;
    const verified = user.emailVerified === true;
    const removed = await this.dataSource.transaction((manager) =>
      purgeAccount(manager, user.id),
    );
    if (!removed) throw new UnauthorizedException(INVALID_CREDENTIALS);
    if (verified) this.sendAccountDeletedEmail(email);
  }

  sendPasswordChangedEmail(to: string): void {
    if (!this.email.canSend()) {
      this.logger.error(
        `Password change email was not sent: ${EMAIL_UNAVAILABLE}`,
      );
      return;
    }
    this.dispatch(async () => {
      const rendered = renderPasswordChangedEmail();
      await this.email.sendIfConfigured({ to, ...rendered });
    });
  }

  sendAccountDeletedEmail(to: string): void {
    if (!this.email.canSend()) {
      this.logger.error(
        `Account deletion email was not sent: ${EMAIL_UNAVAILABLE}`,
      );
      return;
    }
    this.dispatch(async () => {
      const rendered = renderAccountDeletedEmail();
      await this.email.sendIfConfigured({ to, ...rendered });
    });
  }

  private async deliverVerification(user: User): Promise<void> {
    const raw = await this.tokens.issue(
      user.id,
      AUTH_TOKEN_PURPOSE.emailVerification,
      VERIFICATION_TTL_MS,
    );
    const rendered = renderVerificationEmail(
      verificationLink(this.email.appUrl(), raw),
    );
    await this.email.send({ to: user.email, ...rendered });
  }

  /**
   * Config and rate limits finish before the response and do not depend on
   * whether the account exists. Lookup and delivery continue afterwards so a
   * real account and an unknown address return together. Provider failures
   * are logged, not returned. Not-configured is still 503, before any lookup.
   */
  private scheduleDelivery(
    bucket: RateLimitBucket,
    email: string,
    ip: string,
    deliver: (user: User | null) => Promise<void>,
  ): void {
    this.email.assertReady();
    const normalized = email.trim().toLowerCase();
    this.rateLimiter.assert(bucket, normalized, ip);
    this.dispatch(async () => {
      const matches = await this.users.findUsersByEmail(normalized);
      const user = matches.length === 1 ? matches[0] : null;
      await deliver(user);
    });
  }

  private dispatch(work: () => Promise<void>): void {
    let task: Promise<void> = Promise.resolve();
    task = work()
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : 'unknown error';
        this.logger.error(`Email delivery failed: ${detail}`);
      })
      .finally(() => {
        this.pendingMail.delete(task);
      });
    this.pendingMail.add(task);
  }

  private async runLink(
    work: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(work);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (isDeadlock(err)) throw new BadRequestException(INVALID_LINK);
      throw err;
    }
  }
}

function isDeadlock(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = (err as QueryFailedError & { driverError?: { code?: string } })
    .driverError;
  return driver?.code === '40P01';
}

function requiredToken(rawToken: string): string {
  const token = rawToken.trim();
  if (!token) throw new BadRequestException(INVALID_LINK);
  return token;
}

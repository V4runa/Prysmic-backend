import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import {
  AUTH_TOKEN_PURPOSE,
  EMAIL_UNAVAILABLE,
  INVALID_LINK,
  RESET_TTL_MS,
  VERIFICATION_TTL_MS,
} from './account.constants';
import { EmailDelivery } from './email/email.delivery';
import {
  renderPasswordResetEmail,
  renderVerificationEmail,
  resetLink,
  verificationLink,
} from './email/email.templates';
import { AuthRateLimiter, type RateLimitBucket } from './rate-limit';
import { hashPassword } from './password';
import { AuthTokenService } from './tokens/auth-token.service';
import { generateRawToken, hashToken } from './tokens/token-hash';

@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    private readonly users: UserService,
    private readonly tokens: AuthTokenService,
    private readonly email: EmailDelivery,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Signup path. Failure is logged and swallowed so account creation still
   * works before email is configured. The address stays unverified.
   */
  async sendVerificationEmail(user: User): Promise<void> {
    if (user.emailVerified) return;
    this.email.assertReady();
    await this.deliverVerification(user);
  }

  async resendVerification(email: string, ip: string): Promise<void> {
    await this.withGenericDelivery('email_resend', email, ip, async (user) => {
      if (!user || user.emailVerified) return;
      await this.deliverVerification(user);
    });
  }

  async requestPasswordReset(email: string, ip: string): Promise<void> {
    await this.withGenericDelivery(
      'password_reset',
      email,
      ip,
      async (user) => {
        if (!user) {
          // Spend a hash so a missing account is not the only cheap path.
          hashToken(generateRawToken());
          return;
        }
        const raw = await this.tokens.issue(
          user.id,
          AUTH_TOKEN_PURPOSE.passwordReset,
          RESET_TTL_MS,
        );
        const rendered = renderPasswordResetEmail(
          resetLink(this.email.appUrl(), raw),
        );
        await this.email.send({ to: user.email, ...rendered });
      },
    );
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = requiredToken(rawToken);
    await this.dataSource.transaction(async (manager) => {
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
    const passwordHash = await hashPassword(password);
    await this.dataSource.transaction(async (manager) => {
      const userId = await this.tokens.consume(
        manager,
        token,
        AUTH_TOKEN_PURPOSE.passwordReset,
      );
      if (!userId) throw new BadRequestException(INVALID_LINK);
      const updated = await this.users.replacePasswordHash(
        manager,
        userId,
        passwordHash,
      );
      if (!updated) throw new BadRequestException(INVALID_LINK);
      await this.tokens.revokeUnused(
        manager,
        userId,
        AUTH_TOKEN_PURPOSE.passwordReset,
      );
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
   * Config and rate limits run before the lookup and do not depend on whether
   * the account exists. A later send failure is still 503; that can differ
   * from the missing-account path while the provider is down.
   */
  private async withGenericDelivery(
    bucket: RateLimitBucket,
    email: string,
    ip: string,
    deliver: (user: User | null) => Promise<void>,
  ): Promise<void> {
    this.email.assertReady();
    const normalized = email.trim().toLowerCase();
    this.rateLimiter.assert(bucket, normalized, ip);
    const matches = await this.users.findUsersByEmail(normalized);
    const user = matches.length === 1 ? matches[0] : null;
    try {
      await deliver(user);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const detail = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Email delivery failed: ${detail}`);
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
  }
}

function requiredToken(rawToken: string): string {
  const token = rawToken.trim();
  if (!token) throw new BadRequestException(INVALID_LINK);
  return token;
}

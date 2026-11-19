import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../users/user.service';
import * as bcrypt from 'bcrypt';
import { SignupDto, LoginDto } from 'src/dtos/auth';
import { OnboardingService } from '../onboarding/onboarding.service';
import { User } from '../users/user.entity';
import { AccountLifecycleService } from './account-lifecycle.service';
import { INVALID_CREDENTIALS } from './account.constants';
import { hashPassword } from './password';
import { assertPasswordAllowed } from './password-policy';
import { RefreshSessionService } from './sessions/refresh-session.service';
import { refreshDenied } from './sessions/refresh-errors';

interface SessionUser {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  sessionVersion: number;
}

export interface IssuedSession {
  access_token: string;
  emailVerified: boolean;
  /** Raw refresh token. The controller stores it in the cookie and drops it. */
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly onboardingService: OnboardingService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly sessions: RefreshSessionService,
  ) {}

  /**
   * Username and email are different columns, but login accepts either.
   * If they point at two accounts, the password has to match exactly one.
   * Preferring the username would let that account swallow the email login
   * after a reset of the real address.
   */
  async validateUser(
    identifier: string,
    password: string,
  ): Promise<SessionUser> {
    const byUsername = await this.userService.findByUsernameForAuth(identifier);
    const byEmail = await this.userService.findByEmailForAuth(identifier);
    const candidates: User[] = [];
    if (byUsername) candidates.push(byUsername);
    if (byEmail && (!byUsername || byEmail.id !== byUsername.id)) {
      candidates.push(byEmail);
    }
    if (candidates.length === 0) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const matched: User[] = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(password, candidate.password)) {
        matched.push(candidate);
      }
    }
    if (matched.length !== 1) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return sessionUser(matched[0]);
  }

  async signup(signupDto: SignupDto) {
    const email = signupDto.email.trim().toLowerCase();
    const { username, password } = signupDto;
    assertPasswordAllowed(password, { email, username });
    const existingUsername = await this.userService.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Username already taken!');
    }
    if (await this.userService.emailTakenBySomeoneElse(email)) {
      throw new ConflictException('Email already in use!');
    }
    // A username that is someone else's email (or the reverse) makes the
    // shared login identifier ambiguous, including after a password reset.
    if (await this.userService.emailTakenBySomeoneElse(username)) {
      throw new ConflictException('Username already taken!');
    }
    if (await this.userService.usernameCollidesWithEmail(email)) {
      throw new ConflictException('Email already in use!');
    }
    const hashedPassword = await hashPassword(password);
    const user = await this.userService.create({
      username,
      email,
      password: hashedPassword,
    });

    // Seed starter notes, contracts, and tasks.
    // Best-effort: seeding never blocks issuing the access token.
    await this.onboardingService.seedSampleData(user.id);

    // The letter goes out after the response. A missing mail config is logged
    // inside the lifecycle service and does not fail signup.
    this.lifecycle.sendVerificationEmail(user);

    return this.issueSession(user);
  }

  async login(loginDto: LoginDto) {
    // Do not run the signup password policy here. A password that was
    // accepted when the account was created has to keep opening it.
    const user = await this.validateUser(
      loginDto.identifier,
      loginDto.password,
    );
    // Unverified accounts may sign in. emailVerified lets the client ask
    // gently for confirmation. To hard-block later, reject here when
    // user.emailVerified is false before issuing the token.
    return this.issueSession(user);
  }

  /**
   * Replaces the signed-in account's password and returns a new access
   * token for this caller. Other sessions die with the sessionVersion bump.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ) {
    const user = await this.lifecycle.changePassword(
      userId,
      currentPassword,
      newPassword,
      ip,
    );
    // The version bump already kills older access tokens. Revoking the
    // refresh families stops them from minting a token at the new version.
    // This caller's replacement family is issued immediately after.
    await this.sessions.revokeAllForUser(user.id);
    return this.issueSession(user);
  }

  /**
   * Exchanges the refresh cookie for a new access token and a rotated
   * refresh token. Does not require the previous access token, so a client
   * whose hour-long token has lapsed can continue.
   */
  async refresh(raw: string | null): Promise<IssuedSession> {
    const rotated = await this.sessions.rotate(raw);
    if (!rotated.ok) throw refreshDenied(rotated.reason);
    const user = await this.userService.findByIdForSession(rotated.userId);
    if (!user) {
      await this.sessions.revokePresented(rotated.refreshToken);
      throw refreshDenied('revoked');
    }
    return {
      access_token: this.signAccess(sessionUser(user)),
      emailVerified: user.emailVerified === true,
      refreshToken: rotated.refreshToken,
    };
  }

  async logout(raw: string | null): Promise<void> {
    await this.sessions.revokePresented(raw);
  }

  private async issueSession(user: SessionUser): Promise<IssuedSession> {
    return {
      access_token: this.signAccess(user),
      emailVerified: user.emailVerified === true,
      refreshToken: await this.sessions.issue(user.id),
    };
  }

  private signAccess(user: SessionUser): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        sv: user.sessionVersion ?? 0,
      },
      { expiresIn: '1h' },
    );
  }
}

function sessionUser(user: User): SessionUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified === true,
    sessionVersion: user.sessionVersion ?? 0,
  };
}

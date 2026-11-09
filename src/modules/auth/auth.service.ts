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

interface SessionUser {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  sessionVersion: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly onboardingService: OnboardingService,
    private readonly lifecycle: AccountLifecycleService,
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
    const byUsername = await this.userService.findByUsername(identifier);
    const byEmail = await this.userService.findByEmail(identifier);
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

    // Greet the new wanderer with a curated, on-brand starter workspace.
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

  private issueSession(user: SessionUser) {
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      sv: user.sessionVersion ?? 0,
    };
    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: '1h',
      }),
      emailVerified: user.emailVerified === true,
    };
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

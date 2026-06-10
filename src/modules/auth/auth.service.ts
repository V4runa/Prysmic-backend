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

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly onboardingService: OnboardingService,
  ) {}

  async validateUser(identifier: string, password: string): Promise<any> {
    let user = await this.userService.findByUsername(identifier);
    if (!user) {
      user = await this.userService.findByEmail(identifier);
    }
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async signup(signupDto: SignupDto) {
    const { username, email, password } = signupDto;
    const existingUsername = await this.userService.findByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Username already taken!');
    }
    const existingEmail = await this.userService.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('Email already in use!');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userService.create({
      username,
      email,
      password: hashedPassword,
    });

    // Greet the new wanderer with a curated, on-brand starter workspace.
    // Best-effort: seeding never blocks issuing the access token.
    await this.onboardingService.seedSampleData(user.id);

    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
    };
    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: '1h',
      }),
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(
      loginDto.identifier,
      loginDto.password,
    );
    const payload = {
      username: user.username,
      sub: user.id,
      email: user.email,
    };
    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: '1h',
      }),
    };
  }
}

import {
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../users/user.service';
import { sessionVersionMatches } from './session-version';

type AccessPayload = {
  sub?: unknown;
  username?: string;
  email?: string;
  sv?: unknown;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: AccessPayload) {
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) {
      throw new UnauthorizedException('Unauthorized: Invalid or missing token');
    }
    const user = await this.userService.findById(userId);
    if (!user || !sessionVersionMatches(user.sessionVersion, payload.sv)) {
      throw new UnauthorizedException('Unauthorized: Invalid or missing token');
    }
    return {
      userId: user.id,
      username: user.username,
      email: user.email,
    };
  }
}

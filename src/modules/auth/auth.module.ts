import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../users/user.module';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AuthToken } from './tokens/auth-token.entity';
import { AuthTokenService } from './tokens/auth-token.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AuthRateLimiter } from './rate-limit';
import { EmailDelivery } from './email/email.delivery';
import {
  EMAIL_PROVIDER,
  createEmailProvider,
} from './email/email.provider.factory';

@Module({
  imports: [
    forwardRef(() => UserModule),
    OnboardingModule,
    PassportModule,
    TypeOrmModule.forFeature([AuthToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountLifecycleService,
    AuthTokenService,
    AuthRateLimiter,
    EmailDelivery,
    JwtStrategy,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: createEmailProvider,
    },
  ],
  exports: [
    AuthService,
    AuthTokenService,
    AuthRateLimiter,
    AccountLifecycleService,
    EMAIL_PROVIDER,
  ],
})
export class AuthModule {}

import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  HttpCode,
  Ip,
  Post,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  EmailRequestDto,
  ResetPasswordDto,
  SignupDto,
  LoginDto,
  VerifyEmailDto,
} from '../../dtos/auth';
import { AccountLifecycleService } from './account-lifecycle.service';
import { EMAIL_REQUEST_ACCEPTED } from './account.constants';
import { RateLimitFilter } from './rate-limit.filter';
import { normalizeIp } from './rate-limit';

@Controller('auth')
@UseFilters(RateLimitFilter)
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('email/verify')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.lifecycle.verifyEmail(dto.token);
    return { emailVerified: true };
  }

  @Post('email/resend')
  @HttpCode(200)
  async resendVerification(@Body() dto: EmailRequestDto, @Ip() ip: string) {
    await this.lifecycle.resendVerification(dto.email, normalizeIp(ip));
    return { message: EMAIL_REQUEST_ACCEPTED };
  }

  @Post('password/forgot')
  @HttpCode(200)
  async forgotPassword(@Body() dto: EmailRequestDto, @Ip() ip: string) {
    await this.lifecycle.requestPasswordReset(dto.email, normalizeIp(ip));
    return { message: EMAIL_REQUEST_ACCEPTED };
  }

  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.lifecycle.resetPassword(dto.token, dto.password);
    return { passwordUpdated: true };
  }
}

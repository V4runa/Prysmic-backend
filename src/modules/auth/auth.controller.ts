import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type IssuedSession } from './auth.service';
import {
  ChangePasswordDto,
  EmailRequestDto,
  ResetPasswordDto,
  SignupDto,
  LoginDto,
  VerifyEmailDto,
} from '../../dtos/auth';
import { AccountLifecycleService } from './account-lifecycle.service';
import { EMAIL_REQUEST_ACCEPTED } from './account.constants';
import { RateLimitFilter } from './rate-limit.filter';
import { clientIp } from './client-ip';
import { passwordPolicy, type PasswordPolicy } from './password-policy';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './sessions/refresh-cookie';
import { AuthSessionResponse } from './auth-session.response';

@Controller('auth')
@UseFilters(RateLimitFilter)
@UseInterceptors(ClassSerializerInterceptor)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  @Get('password-policy')
  getPasswordPolicy(): PasswordPolicy {
    return passwordPolicy();
  }

  @Post('signup')
  async signup(
    @Body() signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendSession(res, await this.authService.signup(signupDto));
  }

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendSession(res, await this.authService.login(loginDto));
  }

  /**
   * Login itself is not rate-limited. Refresh uses that same posture: the
   * token is 256 bits of entropy, and a wrong one cannot be guessed.
   * Refresh when the access token lapses. Two tabs may present the cookie
   * that was just rotated; for 60 seconds that is a concurrent refresh and
   * returns the session's current cookie. Reuse after that revokes the family.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendSession(
      res,
      await this.authService.refresh(readRefreshCookie(req)),
    );
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      await this.authService.logout(readRefreshCookie(req));
    } finally {
      clearRefreshCookie(res);
    }
    return { loggedOut: true };
  }

  @Post('email/verify')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.lifecycle.verifyEmail(dto.token);
    return { emailVerified: true };
  }

  @Post('email/resend')
  @HttpCode(200)
  resendVerification(@Body() dto: EmailRequestDto, @Req() req: Request) {
    this.lifecycle.resendVerification(dto.email, clientIp(req));
    return { message: EMAIL_REQUEST_ACCEPTED };
  }

  @Post('password/forgot')
  @HttpCode(200)
  forgotPassword(@Body() dto: EmailRequestDto, @Req() req: Request) {
    this.lifecycle.requestPasswordReset(dto.email, clientIp(req));
    return { message: EMAIL_REQUEST_ACCEPTED };
  }

  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.lifecycle.resetPassword(dto.token, dto.password);
    clearRefreshCookie(res);
    return { passwordUpdated: true };
  }

  @Post('password/change')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: Request & { user: { userId: number } },
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendSession(
      res,
      await this.authService.changePassword(
        Number(req.user.userId),
        dto.currentPassword,
        dto.newPassword,
        clientIp(req),
      ),
    );
  }

  /** Puts the refresh token in the cookie and keeps it out of the JSON body. */
  private sendSession(
    res: Response,
    session: IssuedSession,
  ): AuthSessionResponse {
    setRefreshCookie(res, session.refreshToken);
    return AuthSessionResponse.from(session);
  }
}

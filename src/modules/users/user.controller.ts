import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UseFilters,
  NotFoundException,
  ParseIntPipe,
  ClassSerializerInterceptor,
  HttpCode,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeleteAccountDto, UpdateUserDto } from '../../dtos/user';
import { UserService, toPublicUser, PublicUser } from './user.service';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';
import { RateLimitFilter } from '../auth/rate-limit.filter';
import { clientIp } from '../auth/client-ip';

type AuthenticatedRequest = {
  user: { userId: number };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('users')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UserController {
  constructor(
    private readonly userService: UserService,
    @Inject(forwardRef(() => AccountLifecycleService))
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  // The collection is the caller only. It never lists other accounts.
  @Get()
  async findSelf(@Req() req: AuthenticatedRequest): Promise<PublicUser[]> {
    const user = await this.loadSelf(req.user.userId);
    return [toPublicUser(user)];
  }

  @Get('username/:username')
  async findByUsername(
    @Req() req: AuthenticatedRequest,
    @Param('username') username: string,
  ): Promise<PublicUser> {
    const user = await this.loadSelf(req.user.userId);
    if (user.username !== username) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  @Get('email/:email')
  async findByEmail(
    @Req() req: AuthenticatedRequest,
    @Param('email') email: string,
  ): Promise<PublicUser> {
    const user = await this.loadSelf(req.user.userId);
    if (user.email !== email) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  @Get(':id')
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PublicUser> {
    this.assertSelf(req.user.userId, id);
    const user = await this.loadSelf(req.user.userId);
    return toPublicUser(user);
  }

  @Put(':id')
  @UseFilters(RateLimitFilter)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<PublicUser> {
    this.assertSelf(req.user.userId, id);
    const { user, emailChanged } = await this.userService.update(
      Number(req.user.userId),
      dto,
      clientIp(req),
    );
    if (emailChanged) this.lifecycle.sendVerificationEmail(user);
    return toPublicUser(user);
  }

  @Delete('me')
  @HttpCode(204)
  @UseFilters(RateLimitFilter)
  async deleteMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.lifecycle.deleteAccount(
      Number(req.user.userId),
      dto.password,
      clientIp(req),
    );
  }

  // Another id and a missing id share one response so callers cannot tell them apart.
  private assertSelf(authUserId: number, requestedId: number): void {
    const authId = Number(authUserId);
    if (!Number.isInteger(authId) || authId !== requestedId) {
      throw new NotFoundException('User not found');
    }
  }

  private async loadSelf(authUserId: number) {
    const authId = Number(authUserId);
    if (!Number.isInteger(authId)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userService.findById(authId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}

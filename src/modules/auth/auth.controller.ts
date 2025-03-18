import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto } from '../../dtos/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Route to handle user signup
  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  // Route to handle user login
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}

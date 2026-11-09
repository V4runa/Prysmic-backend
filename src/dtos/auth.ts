import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

// DTO for Signing Up
export class SignupDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  // Length, the bcrypt byte cap, and the common-password list are enforced
  // by assertPasswordAllowed in AuthService, together with reset.
  @IsString()
  @IsNotEmpty()
  password: string;
}

// DTO for Logging In
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

  // The previous minimum. Passwords chosen before the stronger rules must
  // still sign in. Signup and reset do not use this bound.
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class EmailRequestDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  // Same shared policy as signup, applied in AccountLifecycleService once
  // the account behind the token is known.
  @IsString()
  @IsNotEmpty()
  password: string;
}

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

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

// DTO for Logging In
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

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

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

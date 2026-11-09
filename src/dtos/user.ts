import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateUserDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  username: string;
}

/** Body for DELETE /users/me. The current password, not a new one. */
export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  username?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @IsNotEmpty()
  email?: string;

  /**
   * Required only when `email` is a different address. A username-only
   * change omits it. Checked against the stored hash, never stored itself.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  currentPassword?: string;
}

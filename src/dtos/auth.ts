import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

// DTO for Signing Up
export class SignupDto {
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

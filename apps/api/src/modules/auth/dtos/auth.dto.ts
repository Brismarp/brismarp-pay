import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  // Mínimo 10 caracteres, ao menos uma letra e um número — ajustável conforme política final de senha.
  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'A senha deve conter letras e números',
  })
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(10)
  twoFactorCode?: string;
}

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

const PASSWORD_RULES = {
  message: 'A senha deve conter letras e números',
};

export class TokenDto {
  @IsString()
  @MinLength(20)
  token: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token: string;

  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, PASSWORD_RULES)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, PASSWORD_RULES)
  newPassword: string;
}

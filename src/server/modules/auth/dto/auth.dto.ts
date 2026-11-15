import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '+998901112233' })
  @IsString()
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  @MaxLength(200)
  newPassword!: string;
}

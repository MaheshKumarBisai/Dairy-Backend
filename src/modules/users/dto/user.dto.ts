import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'OldPassword@123' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiPropertyOptional({ example: 'NewPassword@123' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

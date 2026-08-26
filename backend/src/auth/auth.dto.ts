import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'officer@gabai.ph' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterOfficerDto {
  @ApiProperty({ example: 'Captain Eduardo Santos' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'officer@gabai.ph' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'MDRRMO Clark / Angeles' })
  @IsOptional()
  @IsString()
  lguSector?: string;
}

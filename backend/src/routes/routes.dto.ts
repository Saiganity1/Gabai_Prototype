import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CalculateRouteDto {
  @ApiProperty({ example: 14.5995 })
  @IsNumber()
  originLat: number;

  @ApiProperty({ example: 120.9842 })
  @IsNumber()
  originLng: number;

  @ApiProperty({ example: 14.624 })
  @IsNumber()
  destLat: number;

  @ApiProperty({ example: 120.958 })
  @IsNumber()
  destLng: number;

  @ApiPropertyOptional({ example: 'safe' })
  @IsOptional()
  @IsString()
  preference?: 'safe' | 'balanced' | 'fast';
}

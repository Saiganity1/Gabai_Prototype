import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHazardDto {
  @ApiProperty({ example: 'FLOOD' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: '🌊' })
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiProperty({ example: 'Flash Flood' })
  @IsString()
  label: string;

  @ApiProperty({ example: 14.585 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 120.975 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ example: 92 })
  @IsOptional()
  @IsNumber()
  confidence?: number;
}

export class UpdateHazardStatusDto {
  @ApiProperty({ example: 'Resolved' })
  @IsString()
  status: string;
}

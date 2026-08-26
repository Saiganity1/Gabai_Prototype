import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiPropertyOptional({ example: 'haz-1' })
  @IsOptional()
  @IsString()
  hazardId?: string;

  @ApiProperty({ example: 'FLOOD' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: '🌊' })
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiProperty({ example: 'Water is knee-deep in front of the plaza.' })
  @IsString()
  description: string;

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

  @ApiPropertyOptional({ example: 'Juan D. (Citizen)' })
  @IsOptional()
  @IsString()
  citizenName?: string;

  @ApiPropertyOptional({ example: 'Tondo, Manila' })
  @IsOptional()
  @IsString()
  locationName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

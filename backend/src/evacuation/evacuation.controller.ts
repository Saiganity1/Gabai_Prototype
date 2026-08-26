import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { EvacuationService } from './evacuation.service';

class UpdateOccupancyDto {
  @ApiProperty({ example: 450 })
  @IsNumber()
  occupied: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

@ApiTags('Evacuation')
@Controller('evacuation-centers')
export class EvacuationController {
  constructor(private readonly evacuationService: EvacuationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all evacuation centers' })
  findAll(
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
  ) {
    return this.evacuationService.findAll(lat, lng);
  }

  @Patch(':id/occupancy')
  @ApiOperation({ summary: 'Update evacuation center capacity/occupancy' })
  updateOccupancy(
    @Param('id') id: string,
    @Body() dto: UpdateOccupancyDto,
  ) {
    return this.evacuationService.updateOccupancy(id, dto.occupied, dto.isOpen);
  }
}

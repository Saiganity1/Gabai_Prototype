import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HazardsService } from './hazards.service';
import { CreateHazardDto, UpdateHazardStatusDto } from './hazards.dto';

@ApiTags('Hazards')
@Controller('hazards')
export class HazardsController {
  constructor(private readonly hazardsService: HazardsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active hazards with optional radius filter' })
  findAll(
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('radiusKm') radiusKm?: number,
  ) {
    return this.hazardsService.findAll(lat, lng, radiusKm);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific hazard' })
  findOne(@Param('id') id: string) {
    return this.hazardsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Publish a new hazard' })
  create(@Body() dto: CreateHazardDto) {
    return this.hazardsService.create(dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update hazard status (e.g. Active, Resolved)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateHazardStatusDto,
  ) {
    return this.hazardsService.updateStatus(id, dto.status);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'LGU Verify hazard' })
  verify(@Param('id') id: string) {
    return this.hazardsService.verifyHazard(id);
  }
}

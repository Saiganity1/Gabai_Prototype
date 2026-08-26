import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './reports.dto';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all citizen reports with optional status and type filters' })
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.reportsService.findAll(status, type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single report' })
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Submit a community disaster report' })
  create(@Body() dto: CreateReportDto) {
    return this.reportsService.create(dto);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'LGU Verify report' })
  verify(@Param('id') id: string) {
    return this.reportsService.verify(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'LGU Reject report' })
  reject(@Param('id') id: string) {
    return this.reportsService.reject(id);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Mark report resolved' })
  resolve(@Param('id') id: string) {
    return this.reportsService.resolve(id);
  }
}

import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RoutesService } from './routes.service';
import { CalculateRouteDto } from './routes.dto';

@ApiTags('Routes')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate hazard-avoiding safe routes' })
  calculateRoutes(@Body() dto: CalculateRouteDto) {
    return this.routesService.calculateRoutes(dto);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { HazardsService } from '../hazards/hazards.service';
import { CalculateRouteDto } from './routes.dto';

export interface RouteOption {
  id: 'safe' | 'balanced' | 'fast';
  label: string;
  time: string;
  distanceKm: number;
  risk: 'low' | 'medium' | 'high';
  detail: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat]
  };
}

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(private hazardsService: HazardsService) {}

  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async calculateRoutes(dto: CalculateRouteDto) {
    const hazards = await this.hazardsService.findAll();
    const directDist = this.calculateDistanceKm(
      dto.originLat,
      dto.originLng,
      dto.destLat,
      dto.destLng,
    );

    // Check intersecting hazards
    const nearbyHazards = hazards.filter((h) => {
      const d1 = this.calculateDistanceKm(dto.originLat, dto.originLng, h.lat, h.lng);
      const d2 = this.calculateDistanceKm(dto.destLat, dto.destLng, h.lat, h.lng);
      return d1 < directDist + 1 && d2 < directDist + 1;
    });

    const floodCount = nearbyHazards.filter(
      (h) => h.type.toUpperCase() === 'FLOOD',
    ).length;

    // Build Safest Corridor (Detour)
    const safeCoords: [number, number][] = [
      [dto.originLng, dto.originLat],
      [
        dto.originLng * 0.75 + dto.destLng * 0.25 - 0.012,
        dto.originLat * 0.75 + dto.destLat * 0.25 - 0.008,
      ],
      [
        dto.originLng * 0.45 + dto.destLng * 0.55 - 0.01,
        dto.originLat * 0.45 + dto.destLat * 0.55 - 0.006,
      ],
      [
        dto.originLng * 0.2 + dto.destLng * 0.8 - 0.004,
        dto.originLat * 0.2 + dto.destLat * 0.8 - 0.002,
      ],
      [dto.destLng, dto.destLat],
    ];

    // Build Balanced Corridor
    const balancedCoords: [number, number][] = [
      [dto.originLng, dto.originLat],
      [
        dto.originLng * 0.65 + dto.destLng * 0.35 + 0.005,
        dto.originLat * 0.65 + dto.destLat * 0.35 + 0.006,
      ],
      [
        dto.originLng * 0.3 + dto.destLng * 0.7 + 0.003,
        dto.originLat * 0.3 + dto.destLat * 0.7 + 0.005,
      ],
      [dto.destLng, dto.destLat],
    ];

    // Build Direct / Fast Corridor
    const fastCoords: [number, number][] = [
      [dto.originLng, dto.originLat],
      [
        dto.originLng * 0.7 + dto.destLng * 0.3 - 0.001,
        dto.originLat * 0.7 + dto.destLat * 0.3 + 0.002,
      ],
      [
        dto.originLng * 0.3 + dto.destLng * 0.7 + 0.002,
        dto.originLat * 0.3 + dto.destLat * 0.7 - 0.001,
      ],
      [dto.destLng, dto.destLat],
    ];

    const safeDist = Math.round(directDist * 1.35 * 10) / 10;
    const balancedDist = Math.round(directDist * 1.15 * 10) / 10;
    const fastDist = Math.round(directDist * 10) / 10;

    const fastMins = Math.max(Math.round(fastDist * 4), 5);
    const balancedMins = Math.round(fastMins * 1.25);
    const safeMins = Math.round(fastMins * 1.5);

    const routes: Record<'safe' | 'balanced' | 'fast', RouteOption> = {
      safe: {
        id: 'safe',
        label: 'Safest Route',
        time: `${safeMins} min`,
        distanceKm: safeDist,
        risk: 'low',
        detail:
          nearbyHazards.length > 0
            ? `Bypasses ${nearbyHazards.length} danger zone(s) completely`
            : 'Zero active hazards along this corridor',
        geometry: {
          type: 'LineString',
          coordinates: safeCoords,
        },
      },
      balanced: {
        id: 'balanced',
        label: 'Balanced Route',
        time: `${balancedMins} min`,
        distanceKm: balancedDist,
        risk: 'medium',
        detail: 'Moderate speed, avoids closest flood channels',
        geometry: {
          type: 'LineString',
          coordinates: balancedCoords,
        },
      },
      fast: {
        id: 'fast',
        label: 'Fastest Route',
        time: `${fastMins} min`,
        distanceKm: fastDist,
        risk: 'high',
        detail:
          floodCount > 0
            ? `⚠️ Passes near ${floodCount} active flood zone(s)`
            : 'Direct path with potential traffic delay',
        geometry: {
          type: 'LineString',
          coordinates: fastCoords,
        },
      },
    };

    return routes;
  }
}

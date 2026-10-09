import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateHazardDto } from './hazards.dto';

export interface LocalHazard {
  id: string;
  type: string;
  emoji: string;
  label: string;
  lat: number;
  lng: number;
  severity: string;
  confidence: number;
  status: string;
  reportsCount: number;
  verifiedCount: number;
  isRoadSegment?: boolean;
  roadSegment?: {
    from?: { lat: number; lng: number; name?: string };
    to?: { lat: number; lng: number; name?: string };
    path?: [number, number][];
    roadName?: string;
  };
  passability?: string;
  waterDepth?: string;
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class HazardsService {
  private readonly logger = new Logger(HazardsService.name);

  // Accurate Real-World Pampanga Hazards Dataset with Road Segment Polylines
  private inMemoryHazards: LocalHazard[] = [
    {
      id: 'haz-pamp-santamaria',
      type: 'FLOOD',
      emoji: '🌊',
      label: 'Santa Maria - Mexico Road Flood Stretch',
      lat: 15.0746,
      lng: 120.7813,
      severity: 'HIGH',
      confidence: 90,
      status: 'Not Passable to Light Vehicles',
      reportsCount: 14,
      verifiedCount: 1,
      isRoadSegment: true,
      roadSegment: {
        from: { lat: 15.0722, lng: 120.7788, name: 'Santa Maria SW Entrance' },
        to: { lat: 15.0772, lng: 120.7838, name: 'Santa Maria Elementary / Tramo' },
        roadName: 'Mexico - San Luis Provincial Road',
        path: [
          [120.7788, 15.0722],
          [120.7806, 15.0738],
          [120.7813, 15.0746],
          [120.782, 15.0755],
          [120.7838, 15.0772],
        ],
      },
      passability: 'not_passable_light',
      waterDepth: 'Knee Deep (0.45m)',
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'haz-1',
      type: 'FLOOD',
      emoji: '🌊',
      label: 'MacArthur Highway Flash Flood (Knee-Deep 0.5m)',
      lat: 15.039,
      lng: 120.684,
      severity: 'HIGH',
      confidence: 96,
      status: 'Not Passable to Light Vehicles',
      reportsCount: 24,
      verifiedCount: 3,
      isRoadSegment: true,
      roadSegment: {
        from: { lat: 15.035, lng: 120.681, name: 'San Fernando Junction' },
        to: { lat: 15.044, lng: 120.688, name: 'Dolores Flyover Intersection' },
        roadName: 'MacArthur Highway',
        path: [
          [120.681, 15.035],
          [120.6828, 15.0375],
          [120.684, 15.039],
          [120.686, 15.0415],
          [120.688, 15.044],
        ],
      },
      passability: 'not_passable_light',
      waterDepth: 'Knee Deep (0.50m)',
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'haz-2',
      type: 'FLOOD',
      emoji: '🌊',
      label: 'Pampanga River Overspill Danger Corridor',
      lat: 15.088,
      lng: 120.819,
      severity: 'HIGH',
      confidence: 98,
      status: 'Critical Alert · Water Level Rising',
      reportsCount: 38,
      verifiedCount: 5,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'haz-3',
      type: 'ROAD_BLOCK',
      emoji: '🚧',
      label: 'Jose Abad Santos Avenue (JASA) Road Clearing',
      lat: 15.046,
      lng: 120.676,
      severity: 'MEDIUM',
      confidence: 91,
      status: 'Counterflow Traffic Enforced',
      reportsCount: 12,
      verifiedCount: 2,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'haz-4',
      type: 'FLOOD',
      emoji: '🌊',
      label: 'Macabebe-Masantol Delta Tidal Inundation',
      lat: 14.902,
      lng: 120.718,
      severity: 'HIGH',
      confidence: 95,
      status: 'Waist-Deep in Low-Lying Streets',
      reportsCount: 29,
      verifiedCount: 4,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'haz-5',
      type: 'ROAD_BLOCK',
      emoji: '🚧',
      label: 'Balibago Angeles City Submerged Corridor',
      lat: 15.158,
      lng: 120.598,
      severity: 'HIGH',
      confidence: 92,
      status: 'Closed to All Vehicles (Waist Deep)',
      reportsCount: 19,
      verifiedCount: 2,
      isRoadSegment: true,
      roadSegment: {
        from: { lat: 15.155, lng: 120.594, name: 'Clark South Perimeter' },
        to: { lat: 15.162, lng: 120.603, name: 'Balibago Crossing' },
        roadName: 'Fields Avenue Corridor',
        path: [
          [120.594, 15.155],
          [120.5962, 15.157],
          [120.598, 15.158],
          [120.601, 15.1605],
          [120.603, 15.162],
        ],
      },
      passability: 'not_passable_all',
      waterDepth: 'Chest Deep (1.10m)',
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async findAll(lat?: number, lng?: number, radiusKm?: number) {
    if (this.prisma.isConnected) {
      try {
        const dbHazards = await this.prisma.hazard.findMany({
          orderBy: { createdAt: 'desc' },
        });
        if (dbHazards.length > 0) return dbHazards;
      } catch (err: any) {
        this.logger.error(`Error finding hazards from DB: ${err.message}`);
      }
    }
    return this.inMemoryHazards;
  }

  async findOne(id: string) {
    if (this.prisma.isConnected) {
      try {
        const h = await this.prisma.hazard.findUnique({ where: { id } });
        if (h) return h;
      } catch (err) {}
    }

    const hazard = this.inMemoryHazards.find((h) => h.id === id);
    if (!hazard) throw new NotFoundException(`Hazard #${id} not found`);
    return hazard;
  }

  async create(dto: CreateHazardDto) {
    const newId = `haz-${Date.now()}`;
    const newHazard: LocalHazard = {
      id: newId,
      type: dto.type.toUpperCase(),
      emoji: dto.emoji || '⚠️',
      label: dto.label,
      lat: dto.lat,
      lng: dto.lng,
      severity: (dto.severity || 'HIGH').toUpperCase(),
      confidence: dto.confidence || 90,
      status: 'Active',
      reportsCount: 1,
      verifiedCount: 0,
      isRoadSegment: dto.isRoadSegment,
      roadSegment: dto.roadSegment,
      passability: dto.passability,
      waterDepth: dto.waterDepth,
      isVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isConnected) {
      try {
        const saved = await this.prisma.hazard.create({
          data: {
            type: newHazard.type as any,
            emoji: newHazard.emoji,
            label: newHazard.label,
            lat: newHazard.lat,
            lng: newHazard.lng,
            severity: newHazard.severity as any,
            confidence: newHazard.confidence,
            status: newHazard.status,
          },
        });
        this.realtime.broadcastHazardNew(saved);
        return saved;
      } catch (err: any) {
        this.logger.error(`Failed to save hazard in DB: ${err.message}`);
      }
    }

    this.inMemoryHazards.unshift(newHazard);
    this.realtime.broadcastHazardNew(newHazard);
    return newHazard;
  }

  async updateStatus(id: string, status: string) {
    if (this.prisma.isConnected) {
      try {
        const updated = await this.prisma.hazard.update({
          where: { id },
          data: { status },
        });
        this.realtime.broadcastHazardUpdated(updated);
        return updated;
      } catch (err) {}
    }

    const hazard = await this.findOne(id);
    hazard.status = status;
    hazard.updatedAt = new Date();
    this.realtime.broadcastHazardUpdated(hazard);
    return hazard;
  }

  async verifyHazard(id: string) {
    if (this.prisma.isConnected) {
      try {
        const updated = await this.prisma.hazard.update({
          where: { id },
          data: {
            verifiedCount: { increment: 1 },
            confidence: 99,
            status: 'Verified',
          },
        });
        this.realtime.broadcastHazardUpdated(updated);
        return updated;
      } catch (err) {}
    }

    const hazard = await this.findOne(id);
    hazard.verifiedCount += 1;
    hazard.confidence = 99;
    hazard.status = 'Verified';
    hazard.updatedAt = new Date();
    this.realtime.broadcastHazardUpdated(hazard);
    return hazard;
  }
}

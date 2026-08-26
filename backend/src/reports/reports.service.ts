import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { HazardsService } from '../hazards/hazards.service';
import { CreateReportDto } from './reports.dto';

export interface LocalReport {
  id: string;
  hazardId?: string;
  type: string;
  emoji: string;
  description: string;
  lat: number;
  lng: number;
  severity: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'RESOLVED';
  citizenName: string;
  locationName?: string;
  photoUrl?: string;
  createdAt: Date;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  private inMemoryReports: LocalReport[] = [
    {
      id: 'rep-101',
      hazardId: 'haz-1',
      type: 'FLOOD',
      emoji: '🌊',
      description: 'Water is knee-deep in front of San Fernando commercial corridor along MacArthur Highway.',
      lat: 15.039,
      lng: 120.684,
      severity: 'HIGH',
      status: 'PENDING',
      citizenName: 'Maria Santos (Citizen)',
      locationName: 'Dolores, City of San Fernando, Pampanga',
      createdAt: new Date(Date.now() - 4 * 60 * 1000),
    },
    {
      id: 'rep-102',
      hazardId: 'haz-2',
      type: 'FLOOD',
      emoji: '🌊',
      description: 'Pampanga River water level rising rapidly. Overflowing into riverside barangays.',
      lat: 15.088,
      lng: 120.819,
      severity: 'HIGH',
      status: 'VERIFIED',
      citizenName: 'Captain Ramirez (Barangay Patrol)',
      locationName: 'Candaba-San Luis River Basin, Pampanga',
      createdAt: new Date(Date.now() - 12 * 60 * 1000),
    },
    {
      id: 'rep-103',
      hazardId: 'haz-3',
      type: 'ROAD_BLOCK',
      emoji: '🚧',
      description: 'Road clearing and fallen branches on JASA road heading towards Guagua.',
      lat: 15.046,
      lng: 120.676,
      severity: 'MEDIUM',
      status: 'VERIFIED',
      citizenName: 'Officer Dizon (Traffic Marshal)',
      locationName: 'Jose Abad Santos Ave, San Fernando, Pampanga',
      createdAt: new Date(Date.now() - 25 * 60 * 1000),
    },
  ];

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private hazardsService: HazardsService,
  ) {}

  async findAll(status?: string, type?: string) {
    if (this.prisma.isConnected) {
      try {
        const where: any = {};
        if (status) where.status = status.toUpperCase();
        if (type) where.type = type.toUpperCase();
        const dbReports = await this.prisma.report.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: { hazard: true },
        });
        if (dbReports.length > 0) return dbReports;
      } catch (err: any) {
        this.logger.error(`Error querying reports from DB: ${err.message}`);
      }
    }

    return this.inMemoryReports.filter((r) => {
      if (status && r.status !== status.toUpperCase()) return false;
      if (type && r.type !== type.toUpperCase()) return false;
      return true;
    });
  }

  async findOne(id: string) {
    if (this.prisma.isConnected) {
      try {
        const r = await this.prisma.report.findUnique({
          where: { id },
          include: { hazard: true },
        });
        if (r) return r;
      } catch (err) {}
    }

    const report = this.inMemoryReports.find((r) => r.id === id);
    if (!report) throw new NotFoundException(`Report #${id} not found`);
    return report;
  }

  async create(dto: CreateReportDto) {
    const reportId = `rep-${Date.now()}`;
    const reportType = dto.type.toUpperCase();
    const emoji = dto.emoji || (reportType === 'FLOOD' ? '🌊' : reportType === 'FIRE' ? '🔥' : '🚧');

    let hazardId = dto.hazardId;
    if (!hazardId) {
      const hazard = await this.hazardsService.create({
        type: reportType,
        emoji,
        label: dto.description.slice(0, 30) || `${reportType} Hazard`,
        lat: dto.lat,
        lng: dto.lng,
        severity: dto.severity || 'HIGH',
      });
      hazardId = hazard.id;
    }

    const newReport: LocalReport = {
      id: reportId,
      hazardId,
      type: reportType,
      emoji,
      description: dto.description,
      lat: dto.lat,
      lng: dto.lng,
      severity: (dto.severity || 'HIGH').toUpperCase(),
      status: 'PENDING',
      citizenName: dto.citizenName || 'Anonymous Citizen',
      locationName: dto.locationName || 'Live GPS',
      photoUrl: dto.photoUrl,
      createdAt: new Date(),
    };

    if (this.prisma.isConnected) {
      try {
        const saved = await this.prisma.report.create({
          data: {
            hazardId: newReport.hazardId,
            type: newReport.type as any,
            emoji: newReport.emoji,
            description: newReport.description,
            lat: newReport.lat,
            lng: newReport.lng,
            severity: newReport.severity as any,
            status: 'PENDING',
            citizenName: newReport.citizenName,
            locationName: newReport.locationName,
            photoUrl: newReport.photoUrl,
          },
        });
        this.realtime.broadcastReportNew(saved);
        return saved;
      } catch (err: any) {
        this.logger.error(`Error saving report in DB: ${err.message}`);
      }
    }

    this.inMemoryReports.unshift(newReport);
    this.realtime.broadcastReportNew(newReport);
    return newReport;
  }

  async verify(id: string) {
    if (this.prisma.isConnected) {
      try {
        const updated = await this.prisma.report.update({
          where: { id },
          data: { status: 'VERIFIED' },
        });
        if (updated.hazardId) {
          await this.hazardsService.verifyHazard(updated.hazardId);
        }
        this.realtime.broadcastReportStatus(updated);
        return updated;
      } catch (err) {}
    }

    const report = await this.findOne(id);
    report.status = 'VERIFIED';
    if (report.hazardId) {
      await this.hazardsService.verifyHazard(report.hazardId);
    }
    this.realtime.broadcastReportStatus(report);
    return report;
  }

  async reject(id: string) {
    if (this.prisma.isConnected) {
      try {
        const updated = await this.prisma.report.update({
          where: { id },
          data: { status: 'REJECTED' },
        });
        this.realtime.broadcastReportStatus(updated);
        return updated;
      } catch (err) {}
    }

    const report = await this.findOne(id);
    report.status = 'REJECTED';
    this.realtime.broadcastReportStatus(report);
    return report;
  }

  async resolve(id: string) {
    if (this.prisma.isConnected) {
      try {
        const updated = await this.prisma.report.update({
          where: { id },
          data: { status: 'RESOLVED' },
        });
        if (updated.hazardId) {
          await this.hazardsService.updateStatus(updated.hazardId, 'Resolved');
        }
        this.realtime.broadcastReportStatus(updated);
        return updated;
      } catch (err) {}
    }

    const report = await this.findOne(id);
    report.status = 'RESOLVED';
    if (report.hazardId) {
      await this.hazardsService.updateStatus(report.hazardId, 'Resolved');
    }
    this.realtime.broadcastReportStatus(report);
    return report;
  }
}

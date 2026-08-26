import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LocalEvacCenter {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  occupied: number;
  isOpen: boolean;
  contactNo?: string;
  address?: string;
}

@Injectable()
export class EvacuationService {
  private readonly logger = new Logger(EvacuationService.name);

  private inMemoryCenters: LocalEvacCenter[] = [
    {
      id: 'evac-1',
      name: 'Heroes Hall Disaster Operations & Evacuation Center',
      lat: 15.043,
      lng: 120.683,
      capacity: 1200,
      occupied: 900,
      isOpen: true,
      contactNo: '(045) 961-4444 / 911',
      address: 'San Juan, City of San Fernando, Pampanga',
    },
    {
      id: 'evac-2',
      name: 'Pampanga Provincial Capitol Multi-Purpose Gymnasium',
      lat: 15.032,
      lng: 120.684,
      capacity: 800,
      occupied: 460,
      isOpen: true,
      contactNo: '(045) 961-0000',
      address: 'Capitol Compound, City of San Fernando, Pampanga',
    },
    {
      id: 'evac-3',
      name: 'Angeles City National High School Disaster Evacuation Gym',
      lat: 15.151,
      lng: 120.592,
      capacity: 700,
      occupied: 315,
      isOpen: true,
      contactNo: '(045) 888-1010',
      address: 'Arayat Blvd, Pampang, Angeles City, Pampanga',
    },
    {
      id: 'evac-4',
      name: 'Guagua National Colleges Evacuation Shelter',
      lat: 14.968,
      lng: 120.631,
      capacity: 600,
      occupied: 370,
      isOpen: true,
      contactNo: '(045) 900-2020',
      address: 'Sta. Filomena, Guagua, Pampanga',
    },
    {
      id: 'evac-5',
      name: 'Lubao Municipal Sports Complex Disaster Shelter',
      lat: 14.941,
      lng: 120.601,
      capacity: 850,
      occupied: 300,
      isOpen: true,
      contactNo: '(045) 971-7070',
      address: 'Sta. Catalina, Lubao, Pampanga',
    },
  ];

  constructor(private prisma: PrismaService) {}

  async findAll(lat?: number, lng?: number) {
    if (this.prisma.isConnected) {
      try {
        const dbCenters = await this.prisma.evacuationCenter.findMany({
          orderBy: { name: 'asc' },
        });
        if (dbCenters.length > 0) return dbCenters;
      } catch (err: any) {
        this.logger.error(`Error finding evacuation centers: ${err.message}`);
      }
    }
    return this.inMemoryCenters;
  }

  async updateOccupancy(id: string, occupied: number, isOpen?: boolean) {
    if (this.prisma.isConnected) {
      try {
        const data: any = { occupied };
        if (isOpen !== undefined) data.isOpen = isOpen;
        return await this.prisma.evacuationCenter.update({
          where: { id },
          data,
        });
      } catch (err) {}
    }

    const center = this.inMemoryCenters.find((c) => c.id === id);
    if (!center) throw new NotFoundException(`Evacuation Center #${id} not found`);
    center.occupied = occupied;
    if (isOpen !== undefined) center.isOpen = isOpen;
    return center;
  }
}

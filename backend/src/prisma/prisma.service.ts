import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  public isConnected = false;

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/gabai?schema=public';
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    if (process.env.DATABASE_URL) {
      try {
        await this.$connect();
        this.isConnected = true;
        this.logger.log(' Connected to PostgreSQL Database via Prisma.');
      } catch (err: any) {
        this.logger.warn(
          `⚠️ PostgreSQL connection failed: ${err.message}. Backend running with active in-memory disaster store.`,
        );
      }
    } else {
      this.logger.log(
        'ℹ️ Running with active disaster memory store (Set DATABASE_URL in .env to connect to Postgres).',
      );
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      try {
        await this.$disconnect();
      } catch {}
    }
  }
}

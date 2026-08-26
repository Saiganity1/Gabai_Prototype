import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { HazardsModule } from './hazards/hazards.module';
import { RoutesModule } from './routes/routes.module';
import { EvacuationModule } from './evacuation/evacuation.module';
import { EmergencyModule } from './emergency/emergency.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Global config — loads .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    PrismaModule,

    // Feature modules
    HealthModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    HazardsModule,
    RoutesModule,
    EvacuationModule,
    EmergencyModule,
    AiModule,
    NotificationsModule,
    RealtimeModule,
  ],
})
export class AppModule {}

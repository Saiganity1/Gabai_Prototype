import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LocalizationService } from './localization.service';

@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [AiService, LocalizationService],
  exports: [AiService, LocalizationService],
})
export class AiModule {}

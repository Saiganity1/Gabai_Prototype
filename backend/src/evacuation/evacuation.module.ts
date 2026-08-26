import { Module } from '@nestjs/common';
import { EvacuationController } from './evacuation.controller';
import { EvacuationService } from './evacuation.service';

@Module({
  controllers: [EvacuationController],
  providers: [EvacuationService],
  exports: [EvacuationService],
})
export class EvacuationModule {}

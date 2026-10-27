import { Module } from '@nestjs/common';
import { DairyPlansService } from './dairy-plans.service';
import { DairyPlansController } from './dairy-plans.controller';

@Module({
  controllers: [DairyPlansController],
  providers: [DairyPlansService],
  exports: [DairyPlansService],
})
export class DairyPlansModule {}

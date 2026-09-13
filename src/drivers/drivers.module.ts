import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DriverDocumentsService } from './driver-documents.service';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [OffersModule],
  controllers: [DriversController],
  providers: [DriversService, DriverDocumentsService],
  exports: [DriversService, DriverDocumentsService],
})
export class DriversModule {}

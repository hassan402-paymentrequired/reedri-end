import { Module } from '@nestjs/common';
import { DriverApplicationController } from './driver-application.controller';
import { DriverApplicationService } from './driver-application.service';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  controllers: [DriverApplicationController],
  providers: [DriverApplicationService],
  exports: [DriverApplicationService],
})
export class DriverApplicationModule {}

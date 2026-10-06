import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DriversModule } from '../drivers/drivers.module';
import { DriverApplicationModule } from '../driver-application/driver-application.module';

@Module({
  imports: [DriversModule, DriverApplicationModule],
  controllers: [AdminController],
})
export class AdminModule {}

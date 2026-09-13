import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  controllers: [AdminController],
})
export class AdminModule {}

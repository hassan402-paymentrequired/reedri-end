import { Module } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}

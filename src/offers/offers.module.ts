import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OfferExpiryProcessor } from './offer-expiry.processor';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [QueuesModule],
  providers: [OffersService, OfferExpiryProcessor],
  exports: [OffersService],
})
export class OffersModule {}

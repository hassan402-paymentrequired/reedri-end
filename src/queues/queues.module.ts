import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OFFER_EXPIRY_QUEUE } from './queue-names';

@Module({
  imports: [BullModule.registerQueue({ name: OFFER_EXPIRY_QUEUE })],
  exports: [BullModule],
})
export class QueuesModule {}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { OFFER_EXPIRY_QUEUE, OfferExpiryJob } from '../queues/queue-names';
import { OffersService } from './offers.service';
import { DomainEvent, OfferExpiredEvent } from '../common/events/domain-events';

interface ExpireOfferData {
  offerId: string;
}

interface ExpireDriverPendingOffersData {
  driverProfileId: string;
}

type OfferExpiryJobData = ExpireOfferData | ExpireDriverPendingOffersData;

@Processor(OFFER_EXPIRY_QUEUE)
export class OfferExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(OfferExpiryProcessor.name);

  constructor(
    private readonly offersService: OffersService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(
    job: Job<OfferExpiryJobData, void, OfferExpiryJob>,
  ): Promise<void> {
    switch (job.name) {
      case OfferExpiryJob.ExpireOffer: {
        const { offerId } = job.data as ExpireOfferData;
        const result = await this.offersService.expireIfStillPending(offerId);
        if (result) {
          this.events.emit(
            DomainEvent.OfferExpired,
            new OfferExpiredEvent(
              result.rideRequestId,
              offerId,
              result.driverUserId,
            ),
          );
        }
        return;
      }
      case OfferExpiryJob.ExpireDriverPendingOffers: {
        const { driverProfileId } = job.data as ExpireDriverPendingOffersData;
        await this.offersService.expireAllPendingOffersForDriver(
          driverProfileId,
        );
        return;
      }
      default:
        this.logger.warn(`Unknown job name: ${String(job.name)}`);
    }
  }
}

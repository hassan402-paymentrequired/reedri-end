import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RideRequestStatus, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEvent, TripStatusEvent } from '../common/events/domain-events';
import { TripResponseDto } from './dto/trip-response.dto';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async start(tripId: string, driverUserId: string) {
    const trip = await this.findOwnedByDriver(tripId, driverUserId);
    if (trip.status !== TripStatus.MATCHED) {
      throw new BadRequestException(
        'Trip cannot be started from its current status',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.STARTED, startedAt: new Date() },
      }),
      this.prisma.rideRequest.update({
        where: { id: trip.rideRequestId },
        data: { status: RideRequestStatus.IN_PROGRESS },
      }),
    ]);

    this.events.emit(DomainEvent.TripStarted, new TripStatusEvent(updated));
    return TripResponseDto.from(updated);
  }

  async complete(tripId: string, driverUserId: string) {
    const trip = await this.findOwnedByDriver(tripId, driverUserId);
    if (trip.status !== TripStatus.STARTED) {
      throw new BadRequestException(
        'Trip cannot be completed from its current status',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.COMPLETED, endedAt: new Date() },
      }),
      this.prisma.rideRequest.update({
        where: { id: trip.rideRequestId },
        data: { status: RideRequestStatus.COMPLETED },
      }),
    ]);

    this.events.emit(DomainEvent.TripCompleted, new TripStatusEvent(updated));
    return TripResponseDto.from(updated);
  }

  private async findOwnedByDriver(tripId: string, driverUserId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    if (trip.driverId !== driverUserId) {
      throw new ForbiddenException();
    }
    return trip;
  }
}

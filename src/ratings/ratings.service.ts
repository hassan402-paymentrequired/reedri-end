import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RateTripDto } from './dto/rate-trip.dto';

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async rateTrip(tripId: string, fromUserId: string, dto: RateTripDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.status !== TripStatus.COMPLETED) {
      throw new ForbiddenException(
        'Trip must be completed before it can be rated',
      );
    }

    let toUserId: string;
    if (fromUserId === trip.riderId) {
      toUserId = trip.driverId;
    } else if (fromUserId === trip.driverId) {
      toUserId = trip.riderId;
    } else {
      throw new ForbiddenException('You were not a participant on this trip');
    }

    try {
      const rating = await this.prisma.rating.create({
        data: {
          tripId,
          fromUserId,
          toUserId,
          score: dto.score,
          comment: dto.comment,
        },
      });
      await this.usersService.recalculateRating(toUserId);
      return rating;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('You have already rated this trip');
      }
      throw err;
    }
  }
}

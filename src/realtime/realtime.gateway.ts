import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { Role } from '@prisma/client';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { DriversService } from '../drivers/drivers.service';
import { OffersService } from '../offers/offers.service';
import {
  DomainEvent,
  OfferAcceptedEvent,
  OfferExpiredEvent,
  OfferSubmittedEvent,
  RideRequestCancelledEvent,
  RideRequestCreatedEvent,
  TripStatusEvent,
} from '../common/events/domain-events';
import {
  SubmitOfferPayload,
  AcceptOfferPayload,
  LocationUpdatePayload,
} from './dto/ws-payloads';
import { WsRateLimiter } from './ws-rate-limiter';

interface AuthenticatedSocket extends Socket {
  data: { userId: string; role: Role };
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

// process.env is read here (not via ConfigService) because gateway decorator
// options are evaluated at class-definition time, before Nest's DI container
// (and ConfigModule) exists. `import 'dotenv/config'` at the top of main.ts
// guarantees .env is already loaded into process.env by the time this runs.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : '*';

@WebSocketGateway({ cors: { origin: corsOrigin } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  // In-memory map of driverUserId -> riderUserId for the driver's current
  // active trip, so location pings can be relayed without a DB round trip
  // on every message. Single-process only — once this runs across multiple
  // instances, this needs to move to Redis (see spec's note on scaling
  // Socket.io with a Redis adapter).
  private readonly activeTripRiderByDriver = new Map<string, string>();

  // Per-user-per-event limits — WS messages sit outside ThrottlerGuard's
  // reach (it only instruments HTTP), so without this a client can flood
  // offers or location pings with no backpressure at all.
  private readonly offerSubmitLimiter = new WsRateLimiter(5, 5000);
  private readonly offerAcceptLimiter = new WsRateLimiter(5, 5000);
  private readonly locationUpdateLimiter = new WsRateLimiter(3, 1000);

  constructor(
    private readonly jwtService: JwtService,
    private readonly driversService: DriversService,
    private readonly offersService: OffersService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = this.extractToken(socket);
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (socket as AuthenticatedSocket).data = {
        userId: payload.sub,
        role: payload.role,
      };
      await socket.join(userRoom(payload.sub));
    } catch {
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const { userId, role } = (socket as AuthenticatedSocket).data ?? {};
    if (!userId) return;

    this.offerSubmitLimiter.clear(userId);
    this.offerAcceptLimiter.clear(userId);
    this.locationUpdateLimiter.clear(userId);

    if (role !== Role.DRIVER) return;

    const room = this.server.sockets.adapter.rooms.get(userRoom(userId));
    const stillConnectedElsewhere = !!room && room.size > 0;
    if (!stillConnectedElsewhere) {
      await this.driversService
        .goOffline(userId)
        .catch((err) =>
          this.logger.error(`Failed to mark driver ${userId} offline`, err),
        );
    }
  }

  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('ride:offer:submit')
  async onOfferSubmit(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: SubmitOfferPayload,
  ) {
    if (!this.offerSubmitLimiter.consume(socket.data.userId)) {
      socket.emit('error', {
        message: 'Too many offers submitted — slow down',
      });
      return;
    }
    try {
      return await this.offersService.submitOffer(
        socket.data.userId,
        body.rideRequestId,
        body.offeredFare,
      );
    } catch (err) {
      socket.emit('error', { message: (err as Error).message });
    }
  }

  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('ride:offer:accept')
  async onOfferAccept(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: AcceptOfferPayload,
  ) {
    if (!this.offerAcceptLimiter.consume(socket.data.userId)) {
      socket.emit('error', { message: 'Too many requests — slow down' });
      return;
    }
    try {
      return await this.offersService.acceptOffer(
        socket.data.userId,
        body.offerId,
      );
    } catch (err) {
      socket.emit('error', { message: (err as Error).message });
    }
  }

  @UsePipes(new ValidationPipe({ transform: true }))
  @SubscribeMessage('driver:location:update')
  async onLocationUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: LocationUpdatePayload,
  ) {
    if (!this.locationUpdateLimiter.consume(socket.data.userId)) {
      return;
    }
    try {
      await this.driversService.updateLocation(
        socket.data.userId,
        body.lat,
        body.lng,
      );
      const riderId = this.activeTripRiderByDriver.get(socket.data.userId);
      if (riderId) {
        this.server.to(userRoom(riderId)).emit('driver:location:update', {
          driverId: socket.data.userId,
          lat: body.lat,
          lng: body.lng,
        });
      }
    } catch (err) {
      socket.emit('error', { message: (err as Error).message });
    }
  }

  @OnEvent(DomainEvent.RideRequestCreated)
  handleRideRequestCreated(event: RideRequestCreatedEvent) {
    const payload = {
      id: event.rideRequest.id,
      pickupLat: event.rideRequest.pickupLat,
      pickupLng: event.rideRequest.pickupLng,
      dropoffLat: event.rideRequest.dropoffLat,
      dropoffLng: event.rideRequest.dropoffLng,
      suggestedFare: event.rideRequest.suggestedFare,
    };
    for (const driverUserId of event.nearbyDriverUserIds) {
      this.server.to(userRoom(driverUserId)).emit('ride:request:new', payload);
    }
  }

  @OnEvent(DomainEvent.OfferSubmitted)
  handleOfferSubmitted(event: OfferSubmittedEvent) {
    this.server.to(userRoom(event.riderId)).emit('ride:offer:new', event.offer);
  }

  @OnEvent(DomainEvent.OfferAccepted)
  handleOfferAccepted(event: OfferAcceptedEvent) {
    this.activeTripRiderByDriver.set(event.trip.driverId, event.trip.riderId);
    const payload = { rideRequest: event.rideRequest, trip: event.trip };
    this.server.to(userRoom(event.trip.riderId)).emit('ride:matched', payload);
    this.server.to(userRoom(event.trip.driverId)).emit('ride:matched', payload);
  }

  @OnEvent(DomainEvent.OfferExpired)
  handleOfferExpired(event: OfferExpiredEvent) {
    this.server.to(userRoom(event.driverUserId)).emit('ride:offer:expired', {
      rideRequestId: event.rideRequestId,
      offerId: event.offerId,
    });
  }

  @OnEvent(DomainEvent.TripStarted)
  handleTripStarted(event: TripStatusEvent) {
    const payload = { trip: event.trip };
    this.server.to(userRoom(event.trip.riderId)).emit('trip:started', payload);
    this.server.to(userRoom(event.trip.driverId)).emit('trip:started', payload);
  }

  @OnEvent(DomainEvent.TripCompleted)
  handleTripCompleted(event: TripStatusEvent) {
    this.activeTripRiderByDriver.delete(event.trip.driverId);
    const payload = { trip: event.trip };
    this.server
      .to(userRoom(event.trip.riderId))
      .emit('trip:completed', payload);
    this.server
      .to(userRoom(event.trip.driverId))
      .emit('trip:completed', payload);
  }

  @OnEvent(DomainEvent.RideRequestCancelled)
  handleRideRequestCancelled(event: RideRequestCancelledEvent) {
    const payload = { rideRequestId: event.rideRequest.id };
    this.server
      .to(userRoom(event.rideRequest.riderId))
      .emit('ride:request:cancelled', payload);
    for (const driverUserId of event.affectedDriverUserIds) {
      this.server
        .to(userRoom(driverUserId))
        .emit('ride:request:cancelled', payload);
    }
  }

  private extractToken(socket: Socket): string {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('Missing auth token');
    }
    return token;
  }
}

import { RideOffer, RideRequest, Trip } from '@prisma/client';

/**
 * Domain events emitted by services and consumed by RealtimeGateway.
 * Keeping the WS transport out of domain services means MatchingService,
 * RideRequestsService, OffersService, etc. stay unit-testable without
 * spinning up Socket.io, and the gateway is the only class that knows
 * about rooms/event names on the wire.
 */
export enum DomainEvent {
  RideRequestCreated = 'ride-request.created',
  OfferSubmitted = 'offer.submitted',
  OfferAccepted = 'offer.accepted',
  TripStarted = 'trip.started',
  TripCompleted = 'trip.completed',
  RideRequestCancelled = 'ride-request.cancelled',
  OfferExpired = 'offer.expired',
  DriverLocationUpdated = 'driver.location.updated',
  DriverOnlineStatusChanged = 'driver.online-status.changed',
}

export class RideRequestCreatedEvent {
  constructor(
    public readonly rideRequest: RideRequest,
    public readonly nearbyDriverUserIds: string[],
  ) {}
}

export class OfferSubmittedEvent {
  constructor(
    public readonly offer: RideOffer,
    public readonly riderId: string,
  ) {}
}

export class OfferAcceptedEvent {
  constructor(
    public readonly rideRequest: RideRequest,
    public readonly trip: Trip,
    public readonly acceptedOffer: RideOffer,
    public readonly rejectedDriverUserIds: string[],
  ) {}
}

export class TripStatusEvent {
  constructor(public readonly trip: Trip) {}
}

export class RideRequestCancelledEvent {
  constructor(
    public readonly rideRequest: RideRequest,
    public readonly affectedDriverUserIds: string[],
  ) {}
}

export class OfferExpiredEvent {
  constructor(
    public readonly rideRequestId: string,
    public readonly offerId: string,
    public readonly driverUserId: string,
  ) {}
}

export class DriverLocationUpdatedEvent {
  constructor(
    public readonly driverUserId: string,
    public readonly lat: number,
    public readonly lng: number,
  ) {}
}

export class DriverOnlineStatusChangedEvent {
  constructor(
    public readonly driverUserId: string,
    public readonly isOnline: boolean,
    public readonly lat: number | null,
    public readonly lng: number | null,
  ) {}
}

export const OFFER_EXPIRY_QUEUE = 'offer-expiry';

export enum OfferExpiryJob {
  ExpireOffer = 'expire-offer',
  ExpireDriverPendingOffers = 'expire-driver-pending-offers',
}

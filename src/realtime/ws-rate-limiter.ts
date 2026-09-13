/**
 * Minimal in-memory sliding-window rate limiter for WebSocket message
 * handlers, which sit outside ThrottlerGuard's reach (it only instruments
 * HTTP routes). Same single-process caveat as RealtimeGateway's
 * activeTripRiderByDriver map — fine for one instance, needs to move to
 * Redis if this ever runs behind more than one.
 */
export class WsRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the call is allowed, false if the caller is over the limit. */
  consume(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= this.limit) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  /** Drop tracked state for a key — call on disconnect to avoid an unbounded map. */
  clear(key: string): void {
    this.hits.delete(key);
  }
}

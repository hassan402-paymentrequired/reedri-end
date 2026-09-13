import { WsRateLimiter } from './ws-rate-limiter';

describe('WsRateLimiter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows calls up to the limit within the window', () => {
    const limiter = new WsRateLimiter(3, 1000);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u1')).toBe(true);
  });

  it('blocks calls once the limit is exceeded within the window', () => {
    const limiter = new WsRateLimiter(2, 1000);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u1')).toBe(false);
  });

  it('tracks each key independently', () => {
    const limiter = new WsRateLimiter(1, 1000);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u2')).toBe(true);
    expect(limiter.consume('u1')).toBe(false);
  });

  it('allows calls again once the window has passed', () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const limiter = new WsRateLimiter(1, 1000);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u1')).toBe(false);

    now += 1001;
    expect(limiter.consume('u1')).toBe(true);
  });

  it('resets tracked state for a key on clear()', () => {
    const limiter = new WsRateLimiter(1, 1000);
    expect(limiter.consume('u1')).toBe(true);
    expect(limiter.consume('u1')).toBe(false);
    limiter.clear('u1');
    expect(limiter.consume('u1')).toBe(true);
  });
});

/**
 * Per-socket sliding-window rate limiter for Socket.IO events.
 */
export function createEventRateLimiter(maxEvents: number, windowMs: number) {
  let count = 0;
  let windowStart = Date.now();

  return (): boolean => {
  const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= maxEvents;
  };
}

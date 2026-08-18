import { redis } from "../db/redis";

const HOURLY_WINDOW_SECONDS = 60 * 60;

export interface RateLimitResult {
  allowed: boolean;
  retryAt: number;
  count: number;
}

export const checkHourlyRateLimit = async (
  senderId: string,
  hourlyLimit: number
): Promise<RateLimitResult> => {
  const now = Date.now();

  const windowStart =
    Math.floor(now / (HOURLY_WINDOW_SECONDS * 1000)) *
    (HOURLY_WINDOW_SECONDS * 1000);

  const windowEnd =
    windowStart + HOURLY_WINDOW_SECONDS * 1000;

  const key = `email-rate:${senderId}:${windowStart}`;

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(
      key,
      HOURLY_WINDOW_SECONDS + 60
    );
  }

  if (count <= hourlyLimit) {
    return {
      allowed: true,
      retryAt: windowEnd,
      count,
    };
  }

  // Don't consume a rate-limit slot for a job
  // that wasn't actually sent.
  await redis.decr(key);

  return {
    allowed: false,
    retryAt: windowEnd,
    count: hourlyLimit,
  };
};
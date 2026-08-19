import Redis from "ioredis";
import { env } from "../config/env";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,

  password: env.REDIS_PASSWORD || undefined,

  tls: env.REDIS_HOST.includes("upstash.io")
    ? {}
    : undefined,

  maxRetriesPerRequest: null,

  connectTimeout: 10000,

  retryStrategy(times) {
    return Math.min(times * 1000, 5000);
  },
});

redis.on("connect", () => {
  console.log("Redis connection established");
});

redis.on("ready", () => {
  console.log("Redis connection ready");
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error);
});

redis.on("close", () => {
  console.log("Redis connection closed");
});
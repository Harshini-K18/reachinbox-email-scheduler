import Redis from "ioredis";

import { env } from "../config/env";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  username: "default",
  password: env.REDIS_PASSWORD,
  tls: {},
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("Redis connection established");
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error);
});
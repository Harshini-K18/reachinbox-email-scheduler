import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string(),

  REDIS_HOST: z.string().default("localhost"),

  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  WORKER_CONCURRENCY: z.coerce.number().default(5),

  MIN_EMAIL_DELAY_MS: z.coerce.number().default(2000),

  DEFAULT_HOURLY_LIMIT: z.coerce.number().default(100),

  ETHEREAL_HOST: z.string(),

  ETHEREAL_PORT: z.coerce.number(),

  ETHEREAL_USER: z.string(),

  ETHEREAL_PASSWORD: z.string(),
  FRONTEND_URL: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  AUTH_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
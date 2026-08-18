import { redis } from "../db/redis";
import { env } from "../config/env";

const LOCK_KEY = "email-send:lock";

export const acquireSendSlot = async (): Promise<number> => {
  while (true) {
    const now = Date.now();

    const result = await redis.set(
      LOCK_KEY,
      now.toString(),
      "PX",
      env.MIN_EMAIL_DELAY_MS,
      "NX"
    );

    if (result === "OK") {
      return now;
    }

    const lastLock = await redis.get(LOCK_KEY);

    if (!lastLock) {
      continue;
    }

    const elapsed = now - Number(lastLock);
    const remaining = env.MIN_EMAIL_DELAY_MS - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, remaining)
      );
    }
  }
};
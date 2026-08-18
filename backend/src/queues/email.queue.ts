import { Queue } from "bullmq";
import { redis } from "../db/redis";

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>("email-queue", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 5000,
    },

    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },

    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5000,
    },
  },
});
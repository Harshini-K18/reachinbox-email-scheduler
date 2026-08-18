import { Job, Worker } from "bullmq";
import { redis } from "../db/redis";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { emailQueue } from "../queues/email.queue";
import { sendEmail } from "../services/mailer.service";
import { checkHourlyRateLimit } from "../services/rate-limit.service";
import { acquireSendSlot } from "../services/send-lock.service";
import type { EmailJobData } from "../queues/email.queue";

export const emailWorker = new Worker<EmailJobData>(
  "email-queue",

  async (job: Job<EmailJobData>) => {
    console.log(`\n========== JOB ${job.id} START ==========`);

    console.log("1. Fetching email from PostgreSQL...");

    const email = await prisma.email.findUnique({
      where: {
        id: job.data.emailId,
      },
      include: {
        sender: true,
        campaign: true,
      },
    });

    console.log("2. PostgreSQL query completed");

    if (!email) {
      throw new Error(`Email ${job.data.emailId} not found`);
    }

    console.log(`3. Email found: ${email.id}`);
    console.log(`   Recipient: ${email.recipient}`);
    console.log(`   Status: ${email.status}`);

    // Idempotency protection
    if (email.status === "SENT" || email.messageId) {
      console.log(`4. Email already sent. Skipping.`);

      return {
        success: true,
        skipped: true,
        emailId: email.id,
      };
    }

    console.log("4. Checking hourly rate limit...");

    const rateLimit = await checkHourlyRateLimit(
      email.senderId,
      email.campaign.hourlyLimit
    );

    console.log("5. Rate limit result:", rateLimit);

    if (!rateLimit.allowed) {
      const delay = Math.max(
        1000,
        rateLimit.retryAt - Date.now() + 1000
      );

      console.log(
        `Hourly limit reached for sender ${email.senderId}. ` +
        `Rescheduling email ${email.id}.`
      );

      await prisma.email.update({
        where: {
          id: email.id,
        },
        data: {
          scheduledAt: new Date(Date.now() + delay),
          status: "SCHEDULED",
        },
      });

      await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
        },
        {
          jobId: `${email.id}-retry-${rateLimit.retryAt}`,
          delay,
        }
      );

      console.log("Email rescheduled.");

      return {
        success: true,
        rescheduled: true,
        emailId: email.id,
        retryAt: rateLimit.retryAt,
      };
    }

    console.log("6. Acquiring send slot...");

    await acquireSendSlot();

    console.log("7. Send slot acquired.");

    // Re-check after waiting
    console.log("8. Re-checking email status...");

    const latestEmail = await prisma.email.findUnique({
      where: {
        id: email.id,
      },
    });

    console.log("9. Email status re-check completed.");

    if (
      !latestEmail ||
      latestEmail.status === "SENT" ||
      latestEmail.messageId
    ) {
      console.log(`Email ${email.id} was already handled.`);

      return {
        success: true,
        skipped: true,
        emailId: email.id,
      };
    }

    console.log("10. Marking email as PROCESSING...");

    await prisma.email.update({
      where: {
        id: email.id,
      },
      data: {
        status: "PROCESSING",
        attempts: {
          increment: 1,
        },
      },
    });

    console.log("11. Email marked PROCESSING.");

    try {
      console.log("12. Calling sendEmail()...");

      const result = await sendEmail({
        to: email.recipient,
        from: email.sender.email,
        subject: email.subject,
        body: email.body,
        attachments: Array.isArray(
          (email.campaign as any).attachments
        )
          ? (email.campaign as any).attachments
          : [],
      });

      console.log("13. sendEmail() completed.");
      console.log("Mail result:", result);

      console.log("14. Updating email to SENT...");

      const updatedEmail = await prisma.email.update({
        where: {
          id: email.id,
        },
        data: {
          status: "SENT",
          sentAt: new Date(),
          messageId: result.messageId,
          errorMessage: null,
        },
      });

      console.log(
        `15. EMAIL SENT SUCCESSFULLY: ${updatedEmail.id}`
      );

      if (result.previewUrl) {
        console.log(
          `Ethereal preview: ${result.previewUrl}`
        );
      }

      console.log(`========== JOB ${job.id} COMPLETE ==========\n`);

      return {
        success: true,
        emailId: email.id,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown email sending error";

      console.error("EMAIL SEND ERROR:", message);

      await prisma.email.update({
        where: {
          id: email.id,
        },
        data: {
          status: "FAILED",
          errorMessage: message,
        },
      });

      console.error(
        `Email ${email.id} failed:`,
        message
      );

      throw error;
    }
  },

  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
  }
);

emailWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on("failed", (job, error) => {
  console.error(
    `Job ${job?.id} failed:`,
    error.message
  );
});

emailWorker.on("error", (error) => {
  console.error("Worker error:", error);
});
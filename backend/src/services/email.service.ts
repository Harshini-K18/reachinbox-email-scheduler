import { Prisma } from "@prisma/client";
import { emailQueue } from "../queues/email.queue";
import { prisma } from "../db/prisma";

export interface EmailAttachmentInput {
  name: string;
  type: string;
  dataUrl: string;
}

export interface ScheduleEmailsInput {
  senderId: string;
  subject: string;
  body: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  recipients: string[];
  idempotencyKey: string;
  attachments?: EmailAttachmentInput[];
}

export const scheduleEmails = async (
  input: ScheduleEmailsInput
) => {
  const {
    senderId,
    subject,
    body,
    startTime,
    delayMs,
    hourlyLimit,
    recipients,
    idempotencyKey,
    attachments = [],
  } = input;

  if (!recipients.length) {
    throw new Error("At least one recipient is required");
  }

  if (delayMs < 0) {
    throw new Error("Delay cannot be negative");
  }

  if (hourlyLimit <= 0) {
    throw new Error("Hourly limit must be greater than zero");
  }

  if (attachments.length > 10) {
    throw new Error("You can attach at most 10 files");
  }

  let attachmentBytes = 0;

  for (const attachment of attachments) {
    if (!attachment?.name || !attachment?.dataUrl) {
      throw new Error("Invalid attachment");
    }

    if (!attachment.dataUrl.startsWith("data:")) {
      throw new Error(
        `Invalid attachment data for ${attachment.name}`
      );
    }

    const commaIndex = attachment.dataUrl.indexOf(",");

    if (commaIndex === -1) {
      throw new Error(
        `Invalid attachment data for ${attachment.name}`
      );
    }

    const base64 = attachment.dataUrl.slice(
      commaIndex + 1
    );

    attachmentBytes += Math.floor(
      (base64.length * 3) / 4
    );
  }

  if (attachmentBytes > 18 * 1024 * 1024) {
    throw new Error(
      "Attachments are too large. Please keep the total size below 18 MB."
    );
  }

  const scheduledStart = new Date(startTime);

  if (Number.isNaN(scheduledStart.getTime())) {
    throw new Error("Invalid start time");
  }

  if (scheduledStart.getTime() <= Date.now()) {
    throw new Error("Start time must be in the future");
  }

  const sender = await prisma.sender.findUnique({
    where: {
      id: senderId,
    },
  });

  if (!sender) {
    throw new Error("Sender not found");
  }

  // Idempotency check
  const existingCampaign =
    await prisma.campaign.findUnique({
      where: {
        idempotencyKey,
      },
      include: {
        emails: {
          orderBy: {
            sequenceNumber: "asc",
          },
        },
      },
    });

  if (existingCampaign) {
    return {
      campaign: existingCampaign,
      emails: existingCampaign.emails,
      alreadyScheduled: true,
    };
  }

  // Create campaign and email records atomically
  const campaign = await prisma.$transaction(
    async (tx) => {
      const createdCampaign =
        await tx.campaign.create({
          data: {
            userId: sender.userId,
            senderId,
            subject,
            body,
            startTime: scheduledStart,
            delayMs,
            hourlyLimit,
            idempotencyKey,

            // Prisma Json field
            attachments: attachments.length
              ? (attachments as unknown as Prisma.InputJsonValue)
              : [],
          },
        });

      const emailData = recipients.map(
        (recipient, index) => ({
          campaignId: createdCampaign.id,
          senderId,
          recipient: recipient
            .trim()
            .toLowerCase(),
          subject,
          body,
          sequenceNumber: index + 1,
          scheduledAt: new Date(
            scheduledStart.getTime() +
              index * delayMs
          ),
        })
      );

      await tx.email.createMany({
        data: emailData,
      });

      return createdCampaign;
    }
  );

  // Get created emails
  const emails = await prisma.email.findMany({
    where: {
      campaignId: campaign.id,
    },
    orderBy: {
      sequenceNumber: "asc",
    },
  });

  // Add each email to BullMQ as a persistent delayed job
  const now = Date.now();

  for (const email of emails) {
    const delay = Math.max(
      0,
      email.scheduledAt.getTime() - now
    );

    await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
      },
      {
        jobId: email.id,
        delay,
      }
    );
  }

  return {
    campaign,
    emails,
    alreadyScheduled: false,
  };
};

// Get emails that are scheduled or currently processing
export const getScheduledEmails = async (userId?: string) => {
  return prisma.email.findMany({
    where: {
      status: {
        in: ["SCHEDULED", "PROCESSING"],
      },
      deletedAt: null,
      ...(userId ? { sender: { userId } } : {}),
    },
    orderBy: {
      scheduledAt: "asc",
    },
    select: {
      id: true,
      recipient: true,
      subject: true,
      body: true,
      scheduledAt: true,
      sentAt: true,
      status: true,
      attempts: true,
      messageId: true,
      errorMessage: true,
      senderId: true,
      campaignId: true,
      sequenceNumber: true,
      deletedAt: true,
      archivedAt: true,

      campaign: {
        select: {
          id: true,
          subject: true,
          senderId: true,
          startTime: true,
          delayMs: true,
          hourlyLimit: true,
          attachments: true,
        } as any,
      },
    },
  });
};

// Get emails that have been sent or failed
export const getSentEmails = async (userId?: string) => {
  return prisma.email.findMany({
    where: {
      status: {
        in: ["SENT", "FAILED"],
      },
      deletedAt: null,
      ...(userId ? { sender: { userId } } : {}),
    },
    orderBy: {
      sentAt: "desc",
    },
    select: {
      id: true,
      recipient: true,
      subject: true,
      body: true,
      scheduledAt: true,
      sentAt: true,
      status: true,
      messageId: true,
      errorMessage: true,
      attempts: true,
      senderId: true,
      campaignId: true,
      sequenceNumber: true,
      deletedAt: true,
      archivedAt: true,

      campaign: {
        select: {
          id: true,
          subject: true,
          senderId: true,
          startTime: true,
          delayMs: true,
          hourlyLimit: true,
          attachments: true,
        } as any,
      },
    },
  });
};

// Soft-delete an email. This keeps the record for history while removing it
// from Scheduled/Sent counts and lists.
export const deleteEmail = async (emailId: string, userId: string) => {
  const email = await prisma.email.findFirst({
    where: {
      id: emailId,
      sender: { userId },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!email) {
    throw new Error("Email not found");
  }

  return prisma.email.update({
    where: { id: email.id },
    data: { deletedAt: new Date() },
  });
};

// Toggle archive state. Clicking archive again unarchives the email.
export const toggleArchiveEmail = async (emailId: string, userId: string) => {
  const email = await prisma.email.findFirst({
    where: {
      id: emailId,
      sender: { userId },
      deletedAt: null,
    },
    select: { id: true, archivedAt: true },
  });

  if (!email) {
    throw new Error("Email not found");
  }

  return prisma.email.update({
    where: { id: email.id },
    data: {
      archivedAt: email.archivedAt ? null : new Date(),
    },
  });
};

export const getEmailCounts = async (userId: string) => {
  const [scheduled, sent] = await Promise.all([
    prisma.email.count({
      where: {
        sender: { userId },
        deletedAt: null,
        status: { in: ["SCHEDULED", "PROCESSING"] },
      },
    }),
    prisma.email.count({
      where: {
        sender: { userId },
        deletedAt: null,
        status: { in: ["SENT", "FAILED"] },
      },
    }),
  ]);

  return { scheduled, sent };
};

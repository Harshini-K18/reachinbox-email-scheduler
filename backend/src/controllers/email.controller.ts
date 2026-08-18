import { Request, Response } from "express";

import { prisma } from "../db/prisma";

import {
  scheduleEmails as scheduleEmailsService,
  getScheduledEmails,
  getSentEmails,
  deleteEmail as deleteEmailService,
  toggleArchiveEmail as toggleArchiveEmailService,
  getEmailCounts,
} from "../services/email.service";

export const scheduleEmails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const {
      senderId: requestedSenderId,
      subject,
      body,
      startTime,
      delayMs,
      hourlyLimit,
      recipients,
      idempotencyKey,
      attachments,
    } = req.body;

    // Always resolve the sender from the authenticated Google user.
    // The frontend may still send senderId for compatibility, but it is
    // validated against the logged-in user before being used.
    const sender = await prisma.sender.findFirst({
      where: {
        userId: req.user.id,
        ...(requestedSenderId
          ? { id: String(requestedSenderId) }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    if (!sender) {
      res.status(400).json({
        success: false,
        message:
          "No sender account is configured for the logged-in Google user.",
      });
      return;
    }

    if (!subject) {
      res.status(400).json({
        success: false,
        message: "subject is required",
      });
      return;
    }

    if (!body) {
      res.status(400).json({
        success: false,
        message: "body is required",
      });
      return;
    }

    if (!startTime) {
      res.status(400).json({
        success: false,
        message: "startTime is required",
      });
      return;
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({
        success: false,
        message: "At least one recipient is required",
      });
      return;
    }

    if (!idempotencyKey) {
      res.status(400).json({
        success: false,
        message: "idempotencyKey is required",
      });
      return;
    }

    const result = await scheduleEmailsService({
      senderId: sender.id,
      subject,
      body,
      startTime,
      delayMs: Number(delayMs),
      hourlyLimit: Number(hourlyLimit),
      recipients,
      idempotencyKey,
      attachments,
    });

    res.status(result.alreadyScheduled ? 200 : 201).json({
      success: true,
      message: result.alreadyScheduled
        ? "Emails were already scheduled"
        : "Emails scheduled successfully",
      data: result,
    });
  } catch (error) {
    console.error("Schedule email error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Failed to schedule emails";

    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const scheduledEmails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const emails = await getScheduledEmails(req.user.id);

    res.status(200).json({
      success: true,
      data: emails,
    });
  } catch (error) {
    console.error("Failed to fetch scheduled emails:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled emails",
    });
  }
};

export const sentEmails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const emails = await getSentEmails(req.user.id);

    res.status(200).json({
      success: true,
      data: emails,
    });
  } catch (error) {
    console.error("Failed to fetch sent emails:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch sent emails",
    });
  }
};


export const emailCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const counts = await getEmailCounts(req.user.id);
    res.status(200).json({ success: true, data: counts });
  } catch (error) {
    console.error("Failed to fetch email counts:", error);
    res.status(500).json({ success: false, message: "Failed to fetch email counts" });
  }
};

export const deleteEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    await deleteEmailService(String(req.params.id), req.user.id);
    const counts = await getEmailCounts(req.user.id);
    res.status(200).json({ success: true, message: "Email deleted", data: counts });
  } catch (error) {
    console.error("Failed to delete email:", error);
    res.status(404).json({ success: false, message: error instanceof Error ? error.message : "Email not found" });
  }
};

export const toggleArchiveEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const email = await toggleArchiveEmailService(
  String(req.params.id),
  req.user.id
);
    res.status(200).json({
      success: true,
      message: email.archivedAt ? "Email archived" : "Email unarchived",
      data: email,
    });
  } catch (error) {
    console.error("Failed to toggle archive:", error);
    res.status(404).json({ success: false, message: error instanceof Error ? error.message : "Email not found" });
  }
};

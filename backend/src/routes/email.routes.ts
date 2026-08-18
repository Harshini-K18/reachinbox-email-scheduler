import { Router } from "express";

import {
  scheduleEmails,
  scheduledEmails,
  sentEmails,
  emailCounts,
  deleteEmail,
  toggleArchiveEmail,
} from "../controllers/email.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

// Schedule emails
router.post("/schedule", scheduleEmails);

// Get scheduled emails
router.get("/scheduled", scheduledEmails);

// Get sent emails
router.get("/sent", sentEmails);

// Dashboard counts exclude soft-deleted emails.
router.get("/counts", emailCounts);

// Message actions. Archive is a toggle, so calling it again unarchives.
router.delete("/:id", deleteEmail);
router.patch("/:id/archive", toggleArchiveEmail);

export default router;

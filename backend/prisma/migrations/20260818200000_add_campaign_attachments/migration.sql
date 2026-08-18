-- Store campaign attachments as JSON so scheduled jobs can access them later.
ALTER TABLE "Campaign" ADD COLUMN "attachments" JSONB;

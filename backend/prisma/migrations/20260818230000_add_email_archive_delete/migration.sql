ALTER TABLE "Email" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Email" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Email_deletedAt_idx" ON "Email"("deletedAt");
CREATE INDEX "Email_archivedAt_idx" ON "Email"("archivedAt");

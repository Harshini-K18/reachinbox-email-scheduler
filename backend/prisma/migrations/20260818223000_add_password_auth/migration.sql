-- Allow users to authenticate with email/password while preserving Google OAuth.
ALTER TABLE "User"
  ALTER COLUMN "googleId" DROP NOT NULL;

ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT;

/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotencyKey` to the `Campaign` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_idempotencyKey_key" ON "Campaign"("idempotencyKey");

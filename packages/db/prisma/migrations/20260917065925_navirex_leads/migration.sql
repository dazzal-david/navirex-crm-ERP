-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'TALKING', 'INTERESTED', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "NavirexEntity" AS ENUM ('INDIA', 'GERMANY');

-- CreateEnum
CREATE TYPE "LeadKind" AS ENUM ('EPC', 'CUSTOMER', 'OTHER');

-- AlterTable
ALTER TABLE "activity" ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "designation" TEXT;

-- CreateTable
CREATE TABLE "lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kind" "LeadKind" NOT NULL DEFAULT 'EPC',
    "entity" "NavirexEntity",
    "stage" "LeadStage" NOT NULL DEFAULT 'UNASSIGNED',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "source" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "rejectedReason" TEXT,
    "zohoId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_stage_position_idx" ON "lead"("stage", "position");

-- CreateIndex
CREATE INDEX "lead_ownerId_idx" ON "lead"("ownerId");

-- CreateIndex
CREATE INDEX "lead_entity_idx" ON "lead"("entity");

-- CreateIndex
CREATE INDEX "lead_kind_idx" ON "lead"("kind");

-- CreateIndex
CREATE INDEX "lead_companyId_idx" ON "lead"("companyId");

-- CreateIndex
CREATE INDEX "lead_contactId_idx" ON "lead"("contactId");

-- CreateIndex
CREATE INDEX "lead_lastActivityAt_idx" ON "lead"("lastActivityAt");

-- CreateIndex
CREATE INDEX "lead_archivedAt_idx" ON "lead"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_zohoId_key" ON "lead"("zohoId");

-- CreateIndex
CREATE INDEX "activity_leadId_createdAt_idx" ON "activity"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

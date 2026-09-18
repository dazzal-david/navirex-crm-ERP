CREATE TYPE "MessageTemplateChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'NOTE');

CREATE TYPE "ReimbursementStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

CREATE TABLE "messageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MessageTemplateChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "providerTemplateName" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en_US',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inboundWebhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastReceivedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inboundWebhook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employeeProfile" (
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "department" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "employmentType" TEXT,
    "joinedAt" TIMESTAMP(3),
    "bio" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employeeProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "reimbursement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "receiptUrl" TEXT,
    "status" "ReimbursementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "employeeId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reimbursement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messageTemplate_channel_name_key" ON "messageTemplate"("channel", "name");
CREATE INDEX "messageTemplate_active_channel_idx" ON "messageTemplate"("active", "channel");
CREATE INDEX "inboundWebhook_enabled_idx" ON "inboundWebhook"("enabled");
CREATE UNIQUE INDEX "employeeProfile_employeeCode_key" ON "employeeProfile"("employeeCode");
CREATE INDEX "employeeProfile_managerId_idx" ON "employeeProfile"("managerId");
CREATE INDEX "employeeProfile_department_idx" ON "employeeProfile"("department");
CREATE INDEX "reimbursement_employeeId_createdAt_idx" ON "reimbursement"("employeeId", "createdAt");
CREATE INDEX "reimbursement_status_createdAt_idx" ON "reimbursement"("status", "createdAt");

ALTER TABLE "messageTemplate" ADD CONSTRAINT "messageTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inboundWebhook" ADD CONSTRAINT "inboundWebhook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employeeProfile" ADD CONSTRAINT "employeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employeeProfile" ADD CONSTRAINT "employeeProfile_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

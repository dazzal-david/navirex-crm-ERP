ALTER TABLE "appSetting"
ADD COLUMN "reimbursementNotifyManager" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reimbursementNotificationEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

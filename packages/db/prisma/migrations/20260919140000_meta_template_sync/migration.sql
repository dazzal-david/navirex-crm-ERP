ALTER TABLE "messageTemplate"
ADD COLUMN "providerTemplateId" TEXT,
ADD COLUMN "providerStatus" TEXT,
ADD COLUMN "providerCategory" TEXT,
ADD COLUMN "providerSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "messageTemplate_providerTemplateId_key"
ON "messageTemplate"("providerTemplateId");

ALTER TABLE "appSetting"
ADD COLUMN "whatsappBusinessAccountId" TEXT,
ADD COLUMN "whatsappTemplatesLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "whatsappTemplatesLastSyncedAt" TIMESTAMP(3),
ADD COLUMN "whatsappTemplatesLastError" TEXT;

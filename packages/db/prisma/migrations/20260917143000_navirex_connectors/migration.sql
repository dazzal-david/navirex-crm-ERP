ALTER TABLE "lead" ADD COLUMN "externalId" TEXT;

ALTER TABLE "formSubmission" ADD COLUMN "leadId" TEXT;

CREATE TABLE "metaPageConnection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "metaPageConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_source_externalId_key" ON "lead"("source", "externalId");
CREATE INDEX "formSubmission_leadId_idx" ON "formSubmission"("leadId");
CREATE UNIQUE INDEX "metaPageConnection_pageId_key" ON "metaPageConnection"("pageId");
CREATE INDEX "metaPageConnection_connectedById_idx" ON "metaPageConnection"("connectedById");

ALTER TABLE "formSubmission"
ADD CONSTRAINT "formSubmission_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "metaPageConnection"
ADD CONSTRAINT "metaPageConnection_connectedById_fkey"
FOREIGN KEY ("connectedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

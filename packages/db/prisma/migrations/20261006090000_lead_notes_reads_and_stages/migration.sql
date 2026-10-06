CREATE TYPE "LeadStage_new" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'FOLLOW_UP', 'ONBOARDED', 'NOT_INTERESTED', 'NOT_QUALIFIED');

ALTER TABLE "lead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "lead" ALTER COLUMN "stage" TYPE "LeadStage_new" USING (
  CASE "stage"::text
    WHEN 'INTERESTED' THEN 'CONTACTED'
    ELSE "stage"::text
  END
)::"LeadStage_new";
DROP TYPE "LeadStage";
ALTER TYPE "LeadStage_new" RENAME TO "LeadStage";
ALTER TABLE "lead" ALTER COLUMN "stage" SET DEFAULT 'NOT_CONTACTED';

DELETE FROM "activity"
WHERE "type" = 'NOTE'
  AND "leadId" IS NOT NULL
  AND "meta" IS NULL
  AND "subject" IS NULL
  AND "body" IN ('Lead updated.', 'Lead updated from Zoho CRM.');

UPDATE "activity"
SET "type" = 'STAGE_CHANGE',
    "body" = replace(replace(replace(replace(replace(replace(replace("body",
      'NOT_CONTACTED', 'Not contacted'),
      'NOT_INTERESTED', 'Not interested'),
      'NOT_QUALIFIED', 'Not qualified'),
      'FOLLOW_UP', 'Follow-up'),
      'ONBOARDED', 'Onboarded'),
      'CONTACTED', 'Contacted'),
      'INTERESTED', 'Interested')
WHERE "type" = 'NOTE'
  AND "leadId" IS NOT NULL
  AND "meta" IS NULL
  AND "subject" IS NULL
  AND (
    "body" LIKE 'Lead created in %'
    OR "body" LIKE 'Stage changed %'
    OR "body" LIKE 'Lead intake matched %'
    OR "body" LIKE 'Lead received from %'
    OR "body" IN (
      'Lead assigned.',
      'Lead unassigned.',
      'Lead converted to an account.',
      'Lead imported from Zoho CRM.'
    )
  );

INSERT INTO "activity" ("id", "type", "subject", "body", "occurredAt", "leadId", "createdById", "meta", "createdAt", "updatedAt")
SELECT
  'leadnote:' || l."id",
  'NOTE',
  'Internal note',
  btrim(l."notes"),
  l."createdAt",
  l."id",
  COALESCE(l."ownerId", (SELECT u."id" FROM "user" u ORDER BY u."createdAt" ASC, u."id" ASC LIMIT 1)),
  '{"channel": "note", "direction": "internal"}'::jsonb,
  l."createdAt",
  CURRENT_TIMESTAMP
FROM "lead" l
WHERE l."notes" IS NOT NULL
  AND btrim(l."notes") <> ''
  AND EXISTS (SELECT 1 FROM "user")
ON CONFLICT ("id") DO NOTHING;

UPDATE "lead" l
SET "lastActivityAt" = latest."at"
FROM (
  SELECT a."leadId", max(COALESCE(a."occurredAt", a."createdAt")) AS "at"
  FROM "activity" a
  WHERE a."leadId" IS NOT NULL
  GROUP BY a."leadId"
) latest
WHERE latest."leadId" = l."id";

CREATE TABLE "leadConversationRead" (
    "userId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leadConversationRead_pkey" PRIMARY KEY ("userId","leadId")
);

CREATE INDEX "leadConversationRead_leadId_idx" ON "leadConversationRead"("leadId");

ALTER TABLE "leadConversationRead" ADD CONSTRAINT "leadConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leadConversationRead" ADD CONSTRAINT "leadConversationRead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "leadConversationRead" ("userId", "leadId", "readAt")
SELECT u."id", inbound."leadId", CURRENT_TIMESTAMP
FROM "user" u
CROSS JOIN (
  SELECT DISTINCT a."leadId"
  FROM "activity" a
  WHERE a."leadId" IS NOT NULL
    AND a."meta"->>'channel' = 'whatsapp'
    AND a."meta"->>'direction' = 'inbound'
) inbound;

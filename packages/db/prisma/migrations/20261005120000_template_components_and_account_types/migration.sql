-- AlterTable
ALTER TABLE "messageTemplate" ADD COLUMN     "components" JSONB;


UPDATE "company" AS c
SET "accountType" = l."kind"
FROM (
  SELECT DISTINCT ON ("companyId") "companyId", "kind"
  FROM "lead"
  WHERE "companyId" IS NOT NULL AND "archivedAt" IS NULL
  ORDER BY "companyId", "createdAt" ASC
) AS l
WHERE c."id" = l."companyId" AND c."accountType" IS NULL;

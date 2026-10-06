CREATE FUNCTION pg_temp.lead_phone(raw TEXT, entity "NavirexEntity") RETURNS TEXT AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    WHEN d = '' THEN raw
    WHEN btrim(raw) LIKE '+%' THEN '+' || d
    WHEN d LIKE '00%' THEN '+' || substr(d, 3)
    WHEN entity = 'GERMANY' AND d LIKE '49%' THEN '+' || d
    WHEN entity = 'GERMANY' AND d LIKE '0%' THEN '+49' || substr(d, 2)
    WHEN entity = 'GERMANY' THEN '+49' || d
    WHEN length(d) = 10 THEN '+91' || d
    WHEN length(d) = 11 AND d LIKE '0%' THEN '+91' || substr(d, 2)
    WHEN length(d) = 12 AND d LIKE '91%' THEN '+' || d
    ELSE raw
  END
  FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) digits
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "lead"
SET "phone" = pg_temp.lead_phone("phone", "entity")
WHERE "phone" IS NOT NULL
  AND "phone" IS DISTINCT FROM pg_temp.lead_phone("phone", "entity");

UPDATE "lead"
SET "secondaryPhone" = pg_temp.lead_phone("secondaryPhone", "entity")
WHERE "secondaryPhone" IS NOT NULL
  AND "secondaryPhone" IS DISTINCT FROM pg_temp.lead_phone("secondaryPhone", "entity");

CREATE TEMP TABLE "strayWhatsAppLead" AS
SELECT stray."id" AS "strayId", target."id" AS "targetId"
FROM "lead" stray
CROSS JOIN LATERAL (
  SELECT t."id"
  FROM "lead" t
  WHERE t."id" <> stray."id"
    AND t."archivedAt" IS NULL
    AND t."createdAt" < stray."createdAt"
    AND regexp_replace(COALESCE(t."phone", ''), '\D', '', 'g') = regexp_replace(stray."phone", '\D', '', 'g')
  ORDER BY t."createdAt" ASC
  LIMIT 1
) target
WHERE stray."source" = 'WhatsApp'
  AND stray."archivedAt" IS NULL
  AND stray."phone" IS NOT NULL
  AND regexp_replace(stray."phone", '\D', '', 'g') <> '';

UPDATE "activity" a
SET "leadId" = s."targetId"
FROM "strayWhatsAppLead" s
WHERE a."leadId" = s."strayId"
  AND a."type" <> 'STAGE_CHANGE';

DELETE FROM "activity" a
USING "strayWhatsAppLead" s
WHERE a."leadId" = s."strayId";

DELETE FROM "leadConversationRead" r
USING "strayWhatsAppLead" s
WHERE r."leadId" = s."strayId";

UPDATE "lead" l
SET "lastActivityAt" = latest."at"
FROM (
  SELECT a."leadId", max(COALESCE(a."occurredAt", a."createdAt")) AS "at"
  FROM "activity" a
  WHERE a."leadId" IN (SELECT "targetId" FROM "strayWhatsAppLead")
  GROUP BY a."leadId"
) latest
WHERE latest."leadId" = l."id";

UPDATE "lead" l
SET "archivedAt" = CURRENT_TIMESTAMP
FROM "strayWhatsAppLead" s
WHERE l."id" = s."strayId";

DROP TABLE "strayWhatsAppLead";

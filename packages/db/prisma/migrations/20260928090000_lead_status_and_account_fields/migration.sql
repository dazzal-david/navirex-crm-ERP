CREATE TYPE "LeadStage_new" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'ONBOARDED', 'NOT_INTERESTED', 'NOT_QUALIFIED');

ALTER TABLE "lead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "lead" ALTER COLUMN "stage" TYPE "LeadStage_new" USING (
  CASE "stage"::text
    WHEN 'UNASSIGNED' THEN 'NOT_CONTACTED'
    WHEN 'ASSIGNED' THEN 'NOT_CONTACTED'
    WHEN 'TALKING' THEN 'CONTACTED'
    WHEN 'INTERESTED' THEN 'INTERESTED'
    WHEN 'REJECTED' THEN 'NOT_INTERESTED'
    WHEN 'APPROVED' THEN 'ONBOARDED'
  END
)::"LeadStage_new";
DROP TYPE "LeadStage";
ALTER TYPE "LeadStage_new" RENAME TO "LeadStage";
ALTER TABLE "lead" ALTER COLUMN "stage" SET DEFAULT 'NOT_CONTACTED';

-- CreateEnum
CREATE TYPE "EpcPortalStatus" AS ENUM ('NOT_REGISTERED', 'REGISTERED');

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "designation" TEXT,
ADD COLUMN     "secondaryPhone" TEXT,
ADD COLUMN     "secondaryEmail" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "convertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "state" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "accountType" "LeadKind",
ADD COLUMN     "operatingRegions" TEXT,
ADD COLUMN     "installationType" TEXT,
ADD COLUMN     "portalStatus" "EpcPortalStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "portalSubmissions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customersReferred" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "convertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "secondaryPhone" TEXT,
ADD COLUMN     "notes" TEXT;

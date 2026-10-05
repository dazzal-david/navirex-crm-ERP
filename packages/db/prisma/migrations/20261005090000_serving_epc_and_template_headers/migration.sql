-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "servingEpcId" TEXT,
ADD COLUMN     "servingEpcName" TEXT;

-- AlterTable
ALTER TABLE "messageTemplate" ADD COLUMN     "footer" TEXT,
ADD COLUMN     "headerFormat" TEXT,
ADD COLUMN     "headerMediaUrl" TEXT,
ADD COLUMN     "headerText" TEXT;

-- CreateIndex
CREATE INDEX "lead_servingEpcId_idx" ON "lead"("servingEpcId");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_servingEpcId_fkey" FOREIGN KEY ("servingEpcId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;


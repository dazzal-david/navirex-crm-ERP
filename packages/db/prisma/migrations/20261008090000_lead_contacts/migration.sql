CREATE TABLE "leadContact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leadContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leadContact_leadId_idx" ON "leadContact"("leadId");

CREATE INDEX "leadContact_phone_idx" ON "leadContact"("phone");

CREATE INDEX "leadContact_email_idx" ON "leadContact"("email");

ALTER TABLE "leadContact" ADD CONSTRAINT "leadContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

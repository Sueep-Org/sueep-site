-- Quality check follow-through: property manager summary email and janitor notices.
ALTER TABLE "JanitorialQualityCheck" ADD COLUMN "summarySentAt" TIMESTAMP(3),
ADD COLUMN "summarySentTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "teamNotifiedAt" TIMESTAMP(3);

CREATE TABLE "JanitorialQualityNoticeSeen" (
    "qualityCheckId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JanitorialQualityNoticeSeen_pkey" PRIMARY KEY ("qualityCheckId","employeeId")
);

CREATE INDEX "JanitorialQualityNoticeSeen_employeeId_idx" ON "JanitorialQualityNoticeSeen"("employeeId");

ALTER TABLE "JanitorialQualityNoticeSeen" ADD CONSTRAINT "JanitorialQualityNoticeSeen_qualityCheckId_fkey" FOREIGN KEY ("qualityCheckId") REFERENCES "JanitorialQualityCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JanitorialQualityNoticeSeen" ADD CONSTRAINT "JanitorialQualityNoticeSeen_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

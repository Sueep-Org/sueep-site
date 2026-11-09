-- Sub portal Phase 2: job offers subs accept or decline
CREATE TABLE "SubJobOffer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "dayIds" TEXT[],
    "dateKeys" TEXT[],
    "payCents" INTEGER,
    "note" TEXT,
    "answerBy" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "declineNote" TEXT,
    "answeredAt" TIMESTAMP(3),
    "cancelNote" TEXT,
    "groupId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "sentBy" TEXT NOT NULL,
    CONSTRAINT "SubJobOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubJobOffer_contractorId_status_idx" ON "SubJobOffer"("contractorId", "status");
CREATE INDEX "SubJobOffer_projectId_idx" ON "SubJobOffer"("projectId");
CREATE INDEX "SubJobOffer_changeOrderId_idx" ON "SubJobOffer"("changeOrderId");
CREATE INDEX "SubJobOffer_groupId_idx" ON "SubJobOffer"("groupId");
CREATE INDEX "SubJobOffer_status_answerBy_idx" ON "SubJobOffer"("status", "answerBy");
ALTER TABLE "SubJobOffer" ADD CONSTRAINT "SubJobOffer_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubJobOffer" ADD CONSTRAINT "SubJobOffer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubJobOffer" ADD CONSTRAINT "SubJobOffer_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

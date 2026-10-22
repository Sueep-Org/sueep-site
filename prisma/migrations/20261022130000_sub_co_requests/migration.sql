-- Sub change order requests on turnovers (request, lines, photos). New tables only, nothing existing changes.


-- CreateTable
CREATE TABLE "SubCoRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "confirmationUid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "note" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "subTotalCents" INTEGER NOT NULL DEFAULT 0,
    "chargeTotalCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubCoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCoRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "issueId" TEXT,
    "label" TEXT NOT NULL,
    "labelEs" TEXT,
    "per" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "unitChargeCents" INTEGER,
    "unitSubPayCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubCoRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCoRequestPhoto" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "confirmationUid" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "SubCoRequestPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubCoRequest_projectId_idx" ON "SubCoRequest"("projectId");

-- CreateIndex
CREATE INDEX "SubCoRequest_contractorId_idx" ON "SubCoRequest"("contractorId");

-- CreateIndex
CREATE INDEX "SubCoRequest_status_idx" ON "SubCoRequest"("status");

-- CreateIndex
CREATE INDEX "SubCoRequestItem_requestId_idx" ON "SubCoRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "SubCoRequestPhoto_requestId_idx" ON "SubCoRequestPhoto"("requestId");

-- CreateIndex
CREATE INDEX "SubCoRequestPhoto_confirmationUid_idx" ON "SubCoRequestPhoto"("confirmationUid");

-- AddForeignKey
ALTER TABLE "SubCoRequest" ADD CONSTRAINT "SubCoRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCoRequest" ADD CONSTRAINT "SubCoRequest_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCoRequestItem" ADD CONSTRAINT "SubCoRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubCoRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCoRequestPhoto" ADD CONSTRAINT "SubCoRequestPhoto_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubCoRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


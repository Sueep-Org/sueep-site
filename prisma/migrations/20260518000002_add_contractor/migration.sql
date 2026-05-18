-- CreateTable
CREATE TABLE "Contractor" (
    "id"        TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name"      TEXT NOT NULL,
    "email"     TEXT,
    "status"    TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_email_key" ON "Contractor"("email");
CREATE INDEX "Contractor_status_idx" ON "Contractor"("status");
CREATE INDEX "Contractor_name_idx" ON "Contractor"("name");

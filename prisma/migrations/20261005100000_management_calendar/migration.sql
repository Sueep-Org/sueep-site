-- CreateTable
CREATE TABLE "ManagementCategory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "builtinKey" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "remindDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ManagementCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "repeat" TEXT NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "link" TEXT,
    "doneDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,

    CONSTRAINT "ManagementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagementCategory_builtinKey_key" ON "ManagementCategory"("builtinKey");

-- CreateIndex
CREATE INDEX "ManagementEvent_startDate_idx" ON "ManagementEvent"("startDate");

-- CreateIndex
CREATE INDEX "ManagementEvent_categoryId_idx" ON "ManagementEvent"("categoryId");

-- AddForeignKey
ALTER TABLE "ManagementEvent" ADD CONSTRAINT "ManagementEvent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ManagementCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Starting categories: the automatic ones, then a few for manual events.
INSERT INTO "ManagementCategory" ("id", "updatedAt", "builtinKey", "name", "color", "remindDays", "sortOrder") VALUES
  ('mgmtcat_sueep_insurance', CURRENT_TIMESTAMP, 'SUEEP_INSURANCE', 'Sueep insurance', 'rose', ARRAY[30,7], 1),
  ('mgmtcat_sub_insurance', CURRENT_TIMESTAMP, 'SUB_INSURANCE', 'Sub insurance', 'orange', ARRAY[30,7], 2),
  ('mgmtcat_project_cois', CURRENT_TIMESTAMP, 'PROJECT_COIS', 'COIs we issued', 'amber', ARRAY[14], 3),
  ('mgmtcat_coi_requests', CURRENT_TIMESTAMP, 'COI_REQUESTS', 'COI requests due', 'yellow', ARRAY[2], 4),
  ('mgmtcat_time_off', CURRENT_TIMESTAMP, 'TIME_OFF', 'Time off', 'sky', ARRAY[]::INTEGER[], 5),
  ('mgmtcat_background_checks', CURRENT_TIMESTAMP, 'BACKGROUND_CHECKS', 'Background checks', 'violet', ARRAY[30], 6),
  ('mgmtcat_employee_documents', CURRENT_TIMESTAMP, 'EMPLOYEE_DOCUMENTS', 'Employee documents', 'indigo', ARRAY[30], 7),
  ('mgmtcat_janitorial_contracts', CURRENT_TIMESTAMP, 'JANITORIAL_CONTRACTS', 'Janitorial contracts ending', 'teal', ARRAY[60,30], 8),
  ('mgmtcat_payroll', CURRENT_TIMESTAMP, 'PAYROLL', 'Payroll', 'lime', ARRAY[]::INTEGER[], 9),
  ('mgmtcat_anniversaries', CURRENT_TIMESTAMP, 'ANNIVERSARIES', 'Work anniversaries', 'fuchsia', ARRAY[]::INTEGER[], 10),
  ('mgmtcat_licenses', CURRENT_TIMESTAMP, NULL, 'Licenses and permits', 'cyan', ARRAY[30], 11),
  ('mgmtcat_taxes', CURRENT_TIMESTAMP, NULL, 'Taxes and filings', 'blue', ARRAY[14], 12),
  ('mgmtcat_meetings', CURRENT_TIMESTAMP, NULL, 'Meetings', 'slate', ARRAY[1], 13),
  ('mgmtcat_vehicles', CURRENT_TIMESTAMP, NULL, 'Vehicles', 'stone', ARRAY[14], 14),
  ('mgmtcat_other', CURRENT_TIMESTAMP, NULL, 'Other', 'gray', ARRAY[7], 15);

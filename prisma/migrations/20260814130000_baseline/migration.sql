-- CreateEnum
CREATE TYPE "HubSpotLineItemMatchStatus" AS ENUM ('AUTO_APPLIED', 'ALIAS_APPLIED', 'PENDING_REVIEW', 'RESOLVED', 'IGNORED', 'ALREADY_PAID_SKIPPED');

-- CreateEnum
CREATE TYPE "TurnoverRequestStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'QUALITY_CHECK', 'APPROVED');

-- CreateEnum
CREATE TYPE "TurnoverRequestType" AS ENUM ('TURNOVER', 'REGULAR');

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BidBonusEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "BidBonusEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "pmName" TEXT,
    "pmEmail" TEXT,
    "pmPhone" TEXT,
    "builder" TEXT,
    "pricingPackage" JSONB,
    "commissionEmployeeId" TEXT,
    "hubspotDealId" TEXT,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,

    CONSTRAINT "BuildingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateApplication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "positionInterest" TEXT,
    "additionalNotes" TEXT,
    "responses" JSONB,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "internalNotes" TEXT,
    "questionnaireToken" TEXT,
    "questionnaireSentAt" TIMESTAMP(3),
    "questionnaireCompletedAt" TIMESTAMP(3),
    "paperwork" JSONB,
    "paperworkUploadToken" TEXT,
    "paperworkUploadTokenExpiry" TIMESTAMP(3),
    "bankAccountRequired" BOOLEAN NOT NULL DEFAULT false,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "bankRoutingNumber" TEXT,
    "paperworkInstructions" TEXT,

    CONSTRAINT "CandidateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT NOT NULL,
    "contractPdfFilename" TEXT,
    "docusealTemplateId" INTEGER,
    "signingStatus" TEXT,
    "signerEmail" TEXT,
    "docusealSubmissionId" INTEGER,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,

    CONSTRAINT "CandidateContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateApplicationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeOrderId" TEXT NOT NULL,
    "contractPdfFilename" TEXT,
    "docusealTemplateId" INTEGER,
    "signingStatus" TEXT,
    "customerEmail" TEXT,
    "docusealSubmissionId" INTEGER,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,

    CONSTRAINT "ChangeOrderContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderContractorAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "role" TEXT,
    "assignedDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "costCents" INTEGER,

    CONSTRAINT "ChangeOrderContractorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "supervisorUserId" TEXT,
    "projectManagerUserId" TEXT,
    "comment" TEXT,

    CONSTRAINT "ChangeOrderDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderMaterialEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "usedOn" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "costCents" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ChangeOrderMaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderWorkerDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeOrderId" TEXT NOT NULL,
    "employeeId" TEXT,
    "contractorId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrderWorkerDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paperwork" JSONB,
    "paperworkUploadToken" TEXT,
    "paperworkUploadTokenExpiry" TIMESTAMP(3),
    "infoToken" TEXT,
    "infoTokenExpiry" TIMESTAMP(3),
    "contractorFullName" TEXT,
    "address" TEXT,
    "dateOfBirth" TEXT,
    "ssn" TEXT,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "bankRoutingNumber" TEXT,
    "phone" TEXT,
    "hasInsurance" BOOLEAN,
    "backgroundCheckStatus" TEXT DEFAULT 'NOT_DONE',
    "backgroundCheckedAt" TIMESTAMP(3),
    "backgroundCheckExpiresAt" TIMESTAMP(3),
    "backgroundCheckProvider" TEXT,
    "backgroundCheckNotes" TEXT,
    "backgroundCheckConsentAt" TIMESTAMP(3),
    "workersCompCarrier" TEXT,
    "workersCompPolicyNumber" TEXT,
    "workersCompExpiresAt" TIMESTAMP(3),
    "candidateApplicationId" TEXT,
    "manualApplicationInfo" JSONB,
    "employeeId" TEXT,
    "role" TEXT,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractorId" TEXT NOT NULL,
    "role" TEXT,
    "assignedDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "buildingId" TEXT,
    "projectId" TEXT,
    "costCents" INTEGER,
    "taskDescription" TEXT,

    CONSTRAINT "ContractorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorBackgroundCheckEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changedBy" TEXT,

    CONSTRAINT "ContractorBackgroundCheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "contractPdfFilename" TEXT,
    "docusealTemplateId" INTEGER,
    "signingStatus" TEXT,
    "signerEmail" TEXT,
    "docusealSubmissionId" INTEGER,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,

    CONSTRAINT "ContractorContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ContractorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorTimeOff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VACATION',
    "notes" TEXT,

    CONSTRAINT "ContractorTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySafetyCheck" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "checkDate" TIMESTAMP(3) NOT NULL,
    "supervisorName" TEXT NOT NULL,
    "approvedForWork" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "groupPhotoData" BYTEA,
    "groupPhotoMimeType" TEXT,
    "siteArrivalPhotoData" BYTEA,
    "siteArrivalPhotoMimeType" TEXT,
    "groupPhotoUploadedAt" TIMESTAMP(3),
    "siteArrivalPhotoUploadedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "DailySafetyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistanceEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "miles" DOUBLE PRECISION NOT NULL,
    "personName" TEXT,
    "notes" TEXT,

    CONSTRAINT "DistanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3),
    "notes" TEXT,
    "hourlyPayCents" INTEGER,
    "defaultProject" TEXT,
    "requiredDocuments" JSONB NOT NULL DEFAULT '[]',
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "bankRoutingNumber" TEXT,
    "backgroundCheckStatus" TEXT DEFAULT 'NOT_DONE',
    "annualSalaryCents" INTEGER,
    "payType" TEXT NOT NULL DEFAULT 'HOURLY',
    "ssn" TEXT,
    "isOffshore" BOOLEAN NOT NULL DEFAULT false,
    "offshoreMonthlyRateCents" INTEGER,
    "backgroundCheckedAt" TIMESTAMP(3),
    "backgroundCheckExpiresAt" TIMESTAMP(3),
    "backgroundCheckProvider" TEXT,
    "backgroundCheckNotes" TEXT,
    "backgroundCheckConsentAt" TIMESTAMP(3),
    "address" TEXT,
    "dateOfBirth" TEXT,
    "infoToken" TEXT,
    "infoTokenExpiry" TIMESTAMP(3),
    "sourceCandidateApplicationId" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBackgroundCheckEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changedBy" TEXT,

    CONSTRAINT "EmployeeBackgroundCheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "contractPdfFilename" TEXT,
    "docusealTemplateId" INTEGER,
    "signingStatus" TEXT,
    "signerEmail" TEXT,
    "docusealSubmissionId" INTEGER,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,

    CONSTRAINT "EmployeeContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "notes" TEXT,
    "fileData" BYTEA,
    "fileMimeType" TEXT,
    "fileFilename" TEXT,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTimeOff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VACATION',
    "notes" TEXT,

    CONSTRAINT "EmployeeTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',

    CONSTRAINT "ErpUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotInvoiceLineItemMatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "hubspotInvoiceId" TEXT NOT NULL,
    "hubspotLineItemId" TEXT NOT NULL,
    "hubspotDealId" TEXT,
    "lineItemText" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "projectId" TEXT,
    "buildingId" TEXT,
    "matchedSovItemId" TEXT,
    "matchedUnitNumber" TEXT,
    "matchedTurnoverRequestId" TEXT,
    "matchMethod" TEXT,
    "matchScore" DOUBLE PRECISION,
    "candidatesJson" JSONB,
    "status" "HubSpotLineItemMatchStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "resolvedByUserId" TEXT,
    "resolvedByName" TEXT,
    "createAlias" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HubSpotInvoiceLineItemMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotSovAlias" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "sovItemId" TEXT NOT NULL,
    "hubspotText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,

    CONSTRAINT "HubSpotSovAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotUnitAlias" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buildingId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "hubspotText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,

    CONSTRAINT "HubSpotUnitAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "turnoverRequestId" TEXT NOT NULL,
    "laborerId" TEXT NOT NULL,
    "role" TEXT,
    "assignedDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "materialsUsed" JSONB,

    CONSTRAINT "LaborAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "workerName" TEXT NOT NULL,
    "role" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "taskDescription" TEXT,
    "employeeId" TEXT,
    "locationLatitude" DOUBLE PRECISION,
    "locationLongitude" DOUBLE PRECISION,
    "locationAccuracy" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "qualityNotes" TEXT,
    "qualityRating" TEXT,
    "sovItemId" TEXT,
    "clockIn" TEXT,
    "commuteHours" DOUBLE PRECISION,
    "transportationMethod" TEXT,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "usedOn" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "costCents" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "MaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffshorePayrollPayment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "OffshorePayrollPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "projectDate" TIMESTAMP(3),
    "jobTitle" TEXT NOT NULL,
    "supervisor" TEXT,
    "description" TEXT,
    "percentDone" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentInvoiced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractValueCents" INTEGER,
    "estMaterialCents" INTEGER,
    "estTravelCents" INTEGER,
    "estLaborCents" INTEGER,
    "actualLaborCents" INTEGER,
    "actualMaterialCents" INTEGER,
    "estHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "projectEndDate" TIMESTAMP(3),
    "hubspotDealId" TEXT,
    "hubspotPipelineId" TEXT,
    "hubspotStageId" TEXT,
    "billingStatus" TEXT,
    "buildingId" TEXT,
    "turnoverRequestId" TEXT,
    "supervisorUserId" TEXT,
    "hubspotOwnerEmail" TEXT,
    "hubspotOwnerId" TEXT,
    "hubspotOwnerName" TEXT,
    "pricingPackage" JSONB,
    "estimatedDays" INTEGER,
    "actualTravelCents" INTEGER,
    "commissionPaidAt" TIMESTAMP(3),
    "commissionEmployeeId" TEXT,
    "recurringContractPeriodId" TEXT,
    "createdByEmployeeId" TEXT,
    "billingCompletedAt" TIMESTAMP(3),
    "turnoverCompletedAt" TIMESTAMP(3),
    "laborRateCard" JSONB,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChangeOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "estimatedCostCents" INTEGER,
    "estimatedDays" INTEGER,
    "reason" TEXT,
    "resolutionNotes" TEXT,
    "supervisor" TEXT,
    "billingStatus" TEXT,
    "percentInvoiced" INTEGER NOT NULL DEFAULT 0,
    "actualLaborCents" INTEGER,
    "actualMaterialCents" INTEGER,
    "contractValueCents" INTEGER,
    "estLaborCents" INTEGER,
    "estMaterialCents" INTEGER,
    "estTravelCents" INTEGER,
    "actualTravelCents" INTEGER,
    "actualHours" DOUBLE PRECISION,
    "estHours" DOUBLE PRECISION,
    "estLaborers" INTEGER,
    "estSupervisors" INTEGER,
    "completedAt" TIMESTAMP(3),
    "requestedDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3),
    "commissionPaidAt" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "supervisorUserId" TEXT,

    CONSTRAINT "ProjectChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChangeOrderLaborer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeOrderId" TEXT NOT NULL,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskDescription" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualityNotes" TEXT,
    "qualityRating" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "clockIn" TEXT,

    CONSTRAINT "ProjectChangeOrderLaborer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChecklistItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "ProjectChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "hubspotContactId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "signingStatus" TEXT NOT NULL DEFAULT 'SIGNED',
    "customerEmail" TEXT,
    "docusealSubmissionId" INTEGER,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,
    "contractPdfFilename" TEXT,
    "docusealTemplateId" INTEGER,

    CONSTRAINT "ProjectContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supervisorUserId" TEXT,
    "endTime" TEXT,
    "startTime" TEXT,
    "seriesId" TEXT,
    "projectManagerUserId" TEXT,
    "scopeItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,

    CONSTRAINT "ProjectDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedBy" TEXT,
    "takenAt" TIMESTAMP(3),

    CONSTRAINT "ProjectImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLaborAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT,
    "assignedDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ProjectLaborAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,

    CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSOV" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSOV_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSOVItem" (
    "id" TEXT NOT NULL,
    "sovId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "scheduledValueCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "billingStatus" TEXT NOT NULL DEFAULT 'NOT_BILLED',

    CONSTRAINT "ProjectSOVItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectScheduleNudgeDismissal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dismissedByUserId" TEXT,

    CONSTRAINT "ProjectScheduleNudgeDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectScheduleSeries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "supervisorUserId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "repeatDays" INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,
    "projectManagerUserId" TEXT,

    CONSTRAINT "ProjectScheduleSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSovScheduleRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "sovItemId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedEmail" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "comments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "ProjectSovScheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorkOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "requestedBy" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "scopeDetails" TEXT,
    "specifications" TEXT,
    "supportInfo" TEXT,
    "photoUrls" JSONB,

    CONSTRAINT "ProjectWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorkOrderAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ProjectWorkOrderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorkOrderRecord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "siteAddress" TEXT,
    "contacts" TEXT,
    "startDate" TEXT,
    "serviceType" TEXT,
    "notes" TEXT,
    "lastSentToName" TEXT,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "ProjectWorkOrderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorkerDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "seriesId" TEXT,
    "contractorId" TEXT,
    "assignedSovItemId" TEXT,
    "assignedScopeItem" TEXT,

    CONSTRAINT "ProjectWorkerDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "turnoverRequestId" TEXT,
    "supervisorName" TEXT NOT NULL,
    "supervisorSignatureUrl" TEXT,
    "pmApproval" BOOLEAN NOT NULL DEFAULT false,
    "evidencePhotos" JSONB,
    "notes" TEXT,
    "projectId" TEXT,
    "scopeDescription" TEXT,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,
    "monthlyRateCents" INTEGER NOT NULL,
    "billingDayOfMonth" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "commissionEmployeeId" TEXT,

    CONSTRAINT "RecurringContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringContractPeriod" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurringContractId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "billingProjectId" TEXT NOT NULL,
    "commissionPaidAt" TIMESTAMP(3),

    CONSTRAINT "RecurringContractPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringContractUnit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurringContractId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "isCommonArea" BOOLEAN NOT NULL DEFAULT false,
    "fullClean" BOOLEAN NOT NULL DEFAULT true,
    "carpetCleaning" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringContractUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyOrTeam" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "receiptUrl" TEXT,
    "receiptData" BYTEA,
    "receiptMimeType" TEXT,
    "receiptFilename" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyCheckWorker" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "safetyCheckId" TEXT NOT NULL,
    "employeeId" TEXT,
    "workerName" TEXT NOT NULL,
    "hasVest" BOOLEAN NOT NULL DEFAULT false,
    "hasHardHat" BOOLEAN NOT NULL DEFAULT false,
    "hasBoots" BOOLEAN NOT NULL DEFAULT false,
    "hasUniform" BOOLEAN NOT NULL DEFAULT false,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "photoData" BYTEA,
    "photoMimeType" TEXT,
    "photoUploadedAt" TIMESTAMP(3),

    CONSTRAINT "SafetyCheckWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "safetyCheckWorkerId" TEXT NOT NULL,
    "safetyCheckId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT,
    "workerName" TEXT NOT NULL,
    "checkDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "notificationSentAt" TIMESTAMP(3),
    "escalationSentAt" TIMESTAMP(3),
    "violationCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesBidEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "projectStartDate" TIMESTAMP(3),
    "company" TEXT NOT NULL,
    "deal" TEXT,
    "description" TEXT,
    "drawings" TEXT,
    "payoutCents" INTEGER,
    "sent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SalesBidEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoverRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,
    "requestType" "TurnoverRequestType" NOT NULL DEFAULT 'TURNOVER',
    "unitNumber" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "fullPaint" BOOLEAN NOT NULL DEFAULT false,
    "touchUpPaint" INTEGER DEFAULT 0,
    "fullClean" BOOLEAN NOT NULL DEFAULT false,
    "carpetCleaning" BOOLEAN NOT NULL DEFAULT false,
    "materialsAdditional" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priceCents" INTEGER,
    "completedAt" TIMESTAMP(3),
    "invoiceGeneratedAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "createdBy" TEXT,
    "status" "TurnoverRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedPriceCents" INTEGER,
    "pmSignatureUrl" TEXT,
    "pmSignedAt" TIMESTAMP(3),
    "billingStatus" TEXT NOT NULL DEFAULT 'NOT_BILLED',
    "otherWork" BOOLEAN NOT NULL DEFAULT false,
    "otherDescription" TEXT,
    "otherCents" INTEGER,
    "ceilingPaint" BOOLEAN NOT NULL DEFAULT false,
    "sqft" INTEGER,
    "unitQuality" TEXT,
    "isPartialTurn" BOOLEAN NOT NULL DEFAULT false,
    "partialTurnLayout" TEXT,
    "completedScopeItems" JSONB NOT NULL DEFAULT '[]',
    "moveOutDate" TIMESTAMP(3),
    "moveInDate" TIMESTAMP(3),
    "compounding" INTEGER DEFAULT 0,

    CONSTRAINT "TurnoverRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitChecklistPhoto" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklistId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "photoType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "UnitChecklistPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitTurnoverChecklist" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "propertyName" TEXT,
    "unitNumber" TEXT,
    "checklistDate" TEXT,
    "technicianNames" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "photoBefore" BOOLEAN NOT NULL DEFAULT false,
    "photoAfter" BOOLEAN NOT NULL DEFAULT false,
    "conditionScore" INTEGER,
    "issues" TEXT,
    "addlPaintTouchUp" BOOLEAN NOT NULL DEFAULT false,
    "addlFullRepaint" BOOLEAN NOT NULL DEFAULT false,
    "addlCarpetCleaning" BOOLEAN NOT NULL DEFAULT false,
    "addlMaintenanceRepair" BOOLEAN NOT NULL DEFAULT false,
    "addlTrashOut" BOOLEAN NOT NULL DEFAULT false,
    "completedItems" JSONB NOT NULL DEFAULT '{}',
    "supervisorSignature" TEXT,
    "technicianSignature" TEXT,
    "sectionPhotos" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "UnitTurnoverChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContractorAssignmentSOVItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_DayAssignmentChangeOrders" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_DayAssignmentSOVItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_LaborEntrySOVItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_QualityCheckSOVItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "BidBonusEntry_employeeId_idx" ON "BidBonusEntry"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BidBonusEntry_employeeId_weekStart_key" ON "BidBonusEntry"("employeeId" ASC, "weekStart" ASC);

-- CreateIndex
CREATE INDEX "Building_commissionEmployeeId_idx" ON "Building"("commissionEmployeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Building_hubspotDealId_key" ON "Building"("hubspotDealId" ASC);

-- CreateIndex
CREATE INDEX "Building_name_idx" ON "Building"("name" ASC);

-- CreateIndex
CREATE INDEX "BuildingNote_buildingId_idx" ON "BuildingNote"("buildingId" ASC);

-- CreateIndex
CREATE INDEX "CandidateApplication_createdAt_idx" ON "CandidateApplication"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "CandidateApplication_email_idx" ON "CandidateApplication"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateApplication_paperworkUploadToken_key" ON "CandidateApplication"("paperworkUploadToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateApplication_questionnaireToken_key" ON "CandidateApplication"("questionnaireToken" ASC);

-- CreateIndex
CREATE INDEX "CandidateApplication_status_idx" ON "CandidateApplication"("status" ASC);

-- CreateIndex
CREATE INDEX "CandidateContract_candidateId_idx" ON "CandidateContract"("candidateId" ASC);

-- CreateIndex
CREATE INDEX "CandidateContract_docusealSubmissionId_idx" ON "CandidateContract"("docusealSubmissionId" ASC);

-- CreateIndex
CREATE INDEX "CandidateContract_docusealTemplateId_idx" ON "CandidateContract"("docusealTemplateId" ASC);

-- CreateIndex
CREATE INDEX "CandidateDocument_candidateApplicationId_idx" ON "CandidateDocument"("candidateApplicationId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderContract_changeOrderId_idx" ON "ChangeOrderContract"("changeOrderId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderContract_docusealSubmissionId_idx" ON "ChangeOrderContract"("docusealSubmissionId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderContract_docusealTemplateId_idx" ON "ChangeOrderContract"("docusealTemplateId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderContractorAssignment_changeOrderId_idx" ON "ChangeOrderContractorAssignment"("changeOrderId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderContractorAssignment_contractorId_idx" ON "ChangeOrderContractorAssignment"("contractorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderDayAssignment_changeOrderId_date_key" ON "ChangeOrderDayAssignment"("changeOrderId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_date_idx" ON "ChangeOrderDayAssignment"("date" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_projectManagerUserId_idx" ON "ChangeOrderDayAssignment"("projectManagerUserId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_supervisorUserId_idx" ON "ChangeOrderDayAssignment"("supervisorUserId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderMaterialEntry_changeOrderId_idx" ON "ChangeOrderMaterialEntry"("changeOrderId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderMaterialEntry_usedOn_idx" ON "ChangeOrderMaterialEntry"("usedOn" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderWorkerDayAssignment_changeOrderId_contractorId_d_key" ON "ChangeOrderWorkerDayAssignment"("changeOrderId" ASC, "contractorId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderWorkerDayAssignment_changeOrderId_employeeId_dat_key" ON "ChangeOrderWorkerDayAssignment"("changeOrderId" ASC, "employeeId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderWorkerDayAssignment_contractorId_idx" ON "ChangeOrderWorkerDayAssignment"("contractorId" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderWorkerDayAssignment_date_idx" ON "ChangeOrderWorkerDayAssignment"("date" ASC);

-- CreateIndex
CREATE INDEX "ChangeOrderWorkerDayAssignment_employeeId_idx" ON "ChangeOrderWorkerDayAssignment"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_candidateApplicationId_key" ON "Contractor"("candidateApplicationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_email_key" ON "Contractor"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_employeeId_key" ON "Contractor"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_infoToken_key" ON "Contractor"("infoToken" ASC);

-- CreateIndex
CREATE INDEX "Contractor_name_idx" ON "Contractor"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_paperworkUploadToken_key" ON "Contractor"("paperworkUploadToken" ASC);

-- CreateIndex
CREATE INDEX "Contractor_status_idx" ON "Contractor"("status" ASC);

-- CreateIndex
CREATE INDEX "ContractorAssignment_buildingId_idx" ON "ContractorAssignment"("buildingId" ASC);

-- CreateIndex
CREATE INDEX "ContractorAssignment_contractorId_idx" ON "ContractorAssignment"("contractorId" ASC);

-- CreateIndex
CREATE INDEX "ContractorAssignment_projectId_idx" ON "ContractorAssignment"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ContractorBackgroundCheckEvent_contractorId_createdAt_idx" ON "ContractorBackgroundCheckEvent"("contractorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ContractorContract_contractorId_idx" ON "ContractorContract"("contractorId" ASC);

-- CreateIndex
CREATE INDEX "ContractorContract_docusealSubmissionId_idx" ON "ContractorContract"("docusealSubmissionId" ASC);

-- CreateIndex
CREATE INDEX "ContractorContract_docusealTemplateId_idx" ON "ContractorContract"("docusealTemplateId" ASC);

-- CreateIndex
CREATE INDEX "ContractorDocument_contractorId_idx" ON "ContractorDocument"("contractorId" ASC);

-- CreateIndex
CREATE INDEX "ContractorTimeOff_contractorId_startDate_endDate_idx" ON "ContractorTimeOff"("contractorId" ASC, "startDate" ASC, "endDate" ASC);

-- CreateIndex
CREATE INDEX "DailySafetyCheck_checkDate_idx" ON "DailySafetyCheck"("checkDate" ASC);

-- CreateIndex
CREATE INDEX "DailySafetyCheck_projectId_idx" ON "DailySafetyCheck"("projectId" ASC);

-- CreateIndex
CREATE INDEX "DistanceEntry_projectId_idx" ON "DistanceEntry"("projectId" ASC);

-- CreateIndex
CREATE INDEX "DistanceEntry_travelDate_idx" ON "DistanceEntry"("travelDate" ASC);

-- CreateIndex
CREATE INDEX "Employee_defaultProject_idx" ON "Employee"("defaultProject" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email" ASC);

-- CreateIndex
CREATE INDEX "Employee_hourlyPayCents_idx" ON "Employee"("hourlyPayCents" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_infoToken_key" ON "Employee"("infoToken" ASC);

-- CreateIndex
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName" ASC, "firstName" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_sourceCandidateApplicationId_key" ON "Employee"("sourceCandidateApplicationId" ASC);

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status" ASC);

-- CreateIndex
CREATE INDEX "EmployeeBackgroundCheckEvent_employeeId_createdAt_idx" ON "EmployeeBackgroundCheckEvent"("employeeId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "EmployeeContract_docusealSubmissionId_idx" ON "EmployeeContract"("docusealSubmissionId" ASC);

-- CreateIndex
CREATE INDEX "EmployeeContract_docusealTemplateId_idx" ON "EmployeeContract"("docusealTemplateId" ASC);

-- CreateIndex
CREATE INDEX "EmployeeContract_employeeId_idx" ON "EmployeeContract"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "EmployeeDocument_documentType_idx" ON "EmployeeDocument"("documentType" ASC);

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_idx" ON "EmployeeDocument"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "EmployeeDocument_expiresAt_idx" ON "EmployeeDocument"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "EmployeeTimeOff_employeeId_startDate_endDate_idx" ON "EmployeeTimeOff"("employeeId" ASC, "startDate" ASC, "endDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ErpUser_email_key" ON "ErpUser"("email" ASC);

-- CreateIndex
CREATE INDEX "ErpUser_firebaseUid_idx" ON "ErpUser"("firebaseUid" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ErpUser_firebaseUid_key" ON "ErpUser"("firebaseUid" ASC);

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_buildingId_idx" ON "HubSpotInvoiceLineItemMatch"("buildingId" ASC);

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_hubspotInvoiceId_idx" ON "HubSpotInvoiceLineItemMatch"("hubspotInvoiceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotInvoiceLineItemMatch_hubspotLineItemId_key" ON "HubSpotInvoiceLineItemMatch"("hubspotLineItemId" ASC);

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_projectId_idx" ON "HubSpotInvoiceLineItemMatch"("projectId" ASC);

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_status_idx" ON "HubSpotInvoiceLineItemMatch"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotSovAlias_projectId_hubspotText_key" ON "HubSpotSovAlias"("projectId" ASC, "hubspotText" ASC);

-- CreateIndex
CREATE INDEX "HubSpotSovAlias_sovItemId_idx" ON "HubSpotSovAlias"("sovItemId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotUnitAlias_buildingId_hubspotText_key" ON "HubSpotUnitAlias"("buildingId" ASC, "hubspotText" ASC);

-- CreateIndex
CREATE INDEX "HubSpotUnitAlias_buildingId_unitNumber_idx" ON "HubSpotUnitAlias"("buildingId" ASC, "unitNumber" ASC);

-- CreateIndex
CREATE INDEX "LaborAssignment_laborerId_idx" ON "LaborAssignment"("laborerId" ASC);

-- CreateIndex
CREATE INDEX "LaborAssignment_turnoverRequestId_idx" ON "LaborAssignment"("turnoverRequestId" ASC);

-- CreateIndex
CREATE INDEX "LaborEntry_employeeId_idx" ON "LaborEntry"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "LaborEntry_projectId_idx" ON "LaborEntry"("projectId" ASC);

-- CreateIndex
CREATE INDEX "LaborEntry_workDate_idx" ON "LaborEntry"("workDate" ASC);

-- CreateIndex
CREATE INDEX "MaterialEntry_category_idx" ON "MaterialEntry"("category" ASC);

-- CreateIndex
CREATE INDEX "MaterialEntry_projectId_idx" ON "MaterialEntry"("projectId" ASC);

-- CreateIndex
CREATE INDEX "MaterialEntry_usedOn_idx" ON "MaterialEntry"("usedOn" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OffshorePayrollPayment_employeeId_periodStart_key" ON "OffshorePayrollPayment"("employeeId" ASC, "periodStart" ASC);

-- CreateIndex
CREATE INDEX "Project_commissionEmployeeId_idx" ON "Project"("commissionEmployeeId" ASC);

-- CreateIndex
CREATE INDEX "Project_createdByEmployeeId_idx" ON "Project"("createdByEmployeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Project_hubspotDealId_key" ON "Project"("hubspotDealId" ASC);

-- CreateIndex
CREATE INDEX "Project_projectDate_idx" ON "Project"("projectDate" ASC);

-- CreateIndex
CREATE INDEX "Project_recurringContractPeriodId_idx" ON "Project"("recurringContractPeriodId" ASC);

-- CreateIndex
CREATE INDEX "Project_segment_idx" ON "Project"("segment" ASC);

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status" ASC);

-- CreateIndex
CREATE INDEX "ProjectChangeOrder_projectId_createdAt_idx" ON "ProjectChangeOrder"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectChangeOrder_status_idx" ON "ProjectChangeOrder"("status" ASC);

-- CreateIndex
CREATE INDEX "ProjectChangeOrderLaborer_changeOrderId_idx" ON "ProjectChangeOrderLaborer"("changeOrderId" ASC);

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_projectId_date_idx" ON "ProjectChecklistItem"("projectId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "ProjectContact_email_idx" ON "ProjectContact"("email" ASC);

-- CreateIndex
CREATE INDEX "ProjectContact_phone_idx" ON "ProjectContact"("phone" ASC);

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_createdAt_idx" ON "ProjectContact"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContact_projectId_hubspotContactId_key" ON "ProjectContact"("projectId" ASC, "hubspotContactId" ASC);

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_source_idx" ON "ProjectContact"("projectId" ASC, "source" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContract_docusealSubmissionId_key" ON "ProjectContract"("docusealSubmissionId" ASC);

-- CreateIndex
CREATE INDEX "ProjectContract_docusealTemplateId_idx" ON "ProjectContract"("docusealTemplateId" ASC);

-- CreateIndex
CREATE INDEX "ProjectContract_projectId_idx" ON "ProjectContract"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_date_idx" ON "ProjectDayAssignment"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDayAssignment_projectId_date_key" ON "ProjectDayAssignment"("projectId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_projectManagerUserId_idx" ON "ProjectDayAssignment"("projectManagerUserId" ASC);

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_seriesId_idx" ON "ProjectDayAssignment"("seriesId" ASC);

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_supervisorUserId_idx" ON "ProjectDayAssignment"("supervisorUserId" ASC);

-- CreateIndex
CREATE INDEX "ProjectImage_projectId_createdAt_idx" ON "ProjectImage"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectLaborAssignment_employeeId_idx" ON "ProjectLaborAssignment"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLaborAssignment_projectId_employeeId_key" ON "ProjectLaborAssignment"("projectId" ASC, "employeeId" ASC);

-- CreateIndex
CREATE INDEX "ProjectLaborAssignment_projectId_idx" ON "ProjectLaborAssignment"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectNote_projectId_idx" ON "ProjectNote"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSOV_projectId_key" ON "ProjectSOV"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectSOVItem_sovId_idx" ON "ProjectSOVItem"("sovId" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleNudgeDismissal_date_idx" ON "ProjectScheduleNudgeDismissal"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScheduleNudgeDismissal_projectId_date_key" ON "ProjectScheduleNudgeDismissal"("projectId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleSeries_projectId_idx" ON "ProjectScheduleSeries"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectSovScheduleRequest_projectId_idx" ON "ProjectSovScheduleRequest"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectSovScheduleRequest_sovItemId_idx" ON "ProjectSovScheduleRequest"("sovItemId" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkOrder_dueDate_idx" ON "ProjectWorkOrder"("dueDate" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkOrder_priority_idx" ON "ProjectWorkOrder"("priority" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkOrder_projectId_createdAt_idx" ON "ProjectWorkOrder"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkOrderAttachment_projectId_idx" ON "ProjectWorkOrderAttachment"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkOrderRecord_projectId_key" ON "ProjectWorkOrderRecord"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_assignedSovItemId_idx" ON "ProjectWorkerDayAssignment"("assignedSovItemId" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_contractorId_idx" ON "ProjectWorkerDayAssignment"("contractorId" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_date_idx" ON "ProjectWorkerDayAssignment"("date" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_employeeId_idx" ON "ProjectWorkerDayAssignment"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkerDayAssignment_projectId_contractorId_date_key" ON "ProjectWorkerDayAssignment"("projectId" ASC, "contractorId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkerDayAssignment_projectId_employeeId_date_key" ON "ProjectWorkerDayAssignment"("projectId" ASC, "employeeId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_seriesId_idx" ON "ProjectWorkerDayAssignment"("seriesId" ASC);

-- CreateIndex
CREATE INDEX "QualityCheck_projectId_idx" ON "QualityCheck"("projectId" ASC);

-- CreateIndex
CREATE INDEX "QualityCheck_turnoverRequestId_idx" ON "QualityCheck"("turnoverRequestId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContract_buildingId_key" ON "RecurringContract"("buildingId" ASC);

-- CreateIndex
CREATE INDEX "RecurringContract_commissionEmployeeId_idx" ON "RecurringContract"("commissionEmployeeId" ASC);

-- CreateIndex
CREATE INDEX "RecurringContract_status_idx" ON "RecurringContract"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContractPeriod_billingProjectId_key" ON "RecurringContractPeriod"("billingProjectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContractPeriod_recurringContractId_periodStart_key" ON "RecurringContractPeriod"("recurringContractId" ASC, "periodStart" ASC);

-- CreateIndex
CREATE INDEX "RecurringContractUnit_recurringContractId_idx" ON "RecurringContractUnit"("recurringContractId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContractUnit_recurringContractId_unitNumber_key" ON "RecurringContractUnit"("recurringContractId" ASC, "unitNumber" ASC);

-- CreateIndex
CREATE INDEX "Reimbursement_employeeId_idx" ON "Reimbursement"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "Reimbursement_paidAt_idx" ON "Reimbursement"("paidAt" ASC);

-- CreateIndex
CREATE INDEX "SafetyCheckWorker_employeeId_idx" ON "SafetyCheckWorker"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "SafetyCheckWorker_safetyCheckId_idx" ON "SafetyCheckWorker"("safetyCheckId" ASC);

-- CreateIndex
CREATE INDEX "SafetyIncident_employeeId_idx" ON "SafetyIncident"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_idx" ON "SafetyIncident"("projectId" ASC);

-- CreateIndex
CREATE INDEX "SafetyIncident_safetyCheckId_idx" ON "SafetyIncident"("safetyCheckId" ASC);

-- CreateIndex
CREATE INDEX "SafetyIncident_safetyCheckWorkerId_idx" ON "SafetyIncident"("safetyCheckWorkerId" ASC);

-- CreateIndex
CREATE INDEX "SafetyIncident_status_idx" ON "SafetyIncident"("status" ASC);

-- CreateIndex
CREATE INDEX "SalesBidEntry_employeeId_idx" ON "SalesBidEntry"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "TurnoverRequest_buildingId_idx" ON "TurnoverRequest"("buildingId" ASC);

-- CreateIndex
CREATE INDEX "TurnoverRequest_buildingId_unitNumber_billingStatus_idx" ON "TurnoverRequest"("buildingId" ASC, "unitNumber" ASC, "billingStatus" ASC);

-- CreateIndex
CREATE INDEX "TurnoverRequest_requestType_idx" ON "TurnoverRequest"("requestType" ASC);

-- CreateIndex
CREATE INDEX "TurnoverRequest_status_idx" ON "TurnoverRequest"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UnitTurnoverChecklist_projectId_key" ON "UnitTurnoverChecklist"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "_ContractorAssignmentSOVItems_AB_unique" ON "_ContractorAssignmentSOVItems"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_ContractorAssignmentSOVItems_B_index" ON "_ContractorAssignmentSOVItems"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "_DayAssignmentChangeOrders_AB_unique" ON "_DayAssignmentChangeOrders"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_DayAssignmentChangeOrders_B_index" ON "_DayAssignmentChangeOrders"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "_DayAssignmentSOVItems_AB_unique" ON "_DayAssignmentSOVItems"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_DayAssignmentSOVItems_B_index" ON "_DayAssignmentSOVItems"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "_LaborEntrySOVItems_AB_unique" ON "_LaborEntrySOVItems"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_LaborEntrySOVItems_B_index" ON "_LaborEntrySOVItems"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "_QualityCheckSOVItems_AB_unique" ON "_QualityCheckSOVItems"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_QualityCheckSOVItems_B_index" ON "_QualityCheckSOVItems"("B" ASC);

-- AddForeignKey
ALTER TABLE "BidBonusEntry" ADD CONSTRAINT "BidBonusEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingNote" ADD CONSTRAINT "BuildingNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingNote" ADD CONSTRAINT "BuildingNote_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateContract" ADD CONSTRAINT "CandidateContract_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateApplicationId_fkey" FOREIGN KEY ("candidateApplicationId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderContract" ADD CONSTRAINT "ChangeOrderContract_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderContractorAssignment" ADD CONSTRAINT "ChangeOrderContractorAssignment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderContractorAssignment" ADD CONSTRAINT "ChangeOrderContractorAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_projectManagerUserId_fkey" FOREIGN KEY ("projectManagerUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderMaterialEntry" ADD CONSTRAINT "ChangeOrderMaterialEntry_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderWorkerDayAssignment" ADD CONSTRAINT "ChangeOrderWorkerDayAssignment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderWorkerDayAssignment" ADD CONSTRAINT "ChangeOrderWorkerDayAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderWorkerDayAssignment" ADD CONSTRAINT "ChangeOrderWorkerDayAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_candidateApplicationId_fkey" FOREIGN KEY ("candidateApplicationId") REFERENCES "CandidateApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorBackgroundCheckEvent" ADD CONSTRAINT "ContractorBackgroundCheckEvent_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorContract" ADD CONSTRAINT "ContractorContract_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorDocument" ADD CONSTRAINT "ContractorDocument_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorTimeOff" ADD CONSTRAINT "ContractorTimeOff_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySafetyCheck" ADD CONSTRAINT "DailySafetyCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistanceEntry" ADD CONSTRAINT "DistanceEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sourceCandidateApplicationId_fkey" FOREIGN KEY ("sourceCandidateApplicationId") REFERENCES "CandidateApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBackgroundCheckEvent" ADD CONSTRAINT "EmployeeBackgroundCheckEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeOff" ADD CONSTRAINT "EmployeeTimeOff_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_matchedSovItemId_fkey" FOREIGN KEY ("matchedSovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_matchedTurnoverRequestId_fkey" FOREIGN KEY ("matchedTurnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotSovAlias" ADD CONSTRAINT "HubSpotSovAlias_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotSovAlias" ADD CONSTRAINT "HubSpotSovAlias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotSovAlias" ADD CONSTRAINT "HubSpotSovAlias_sovItemId_fkey" FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotUnitAlias" ADD CONSTRAINT "HubSpotUnitAlias_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotUnitAlias" ADD CONSTRAINT "HubSpotUnitAlias_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborAssignment" ADD CONSTRAINT "LaborAssignment_laborerId_fkey" FOREIGN KEY ("laborerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborAssignment" ADD CONSTRAINT "LaborAssignment_turnoverRequestId_fkey" FOREIGN KEY ("turnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_sovItemId_fkey" FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialEntry" ADD CONSTRAINT "MaterialEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffshorePayrollPayment" ADD CONSTRAINT "OffshorePayrollPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_recurringContractPeriodId_fkey" FOREIGN KEY ("recurringContractPeriodId") REFERENCES "RecurringContractPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_turnoverRequestId_fkey" FOREIGN KEY ("turnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeOrder" ADD CONSTRAINT "ProjectChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeOrder" ADD CONSTRAINT "ProjectChangeOrder_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeOrderLaborer" ADD CONSTRAINT "ProjectChangeOrderLaborer_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeOrderLaborer" ADD CONSTRAINT "ProjectChangeOrderLaborer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_projectManagerUserId_fkey" FOREIGN KEY ("projectManagerUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ProjectScheduleSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectImage" ADD CONSTRAINT "ProjectImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSOV" ADD CONSTRAINT "ProjectSOV_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSOVItem" ADD CONSTRAINT "ProjectSOVItem_sovId_fkey" FOREIGN KEY ("sovId") REFERENCES "ProjectSOV"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleNudgeDismissal" ADD CONSTRAINT "ProjectScheduleNudgeDismissal_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleNudgeDismissal" ADD CONSTRAINT "ProjectScheduleNudgeDismissal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleSeries" ADD CONSTRAINT "ProjectScheduleSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSovScheduleRequest" ADD CONSTRAINT "ProjectSovScheduleRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSovScheduleRequest" ADD CONSTRAINT "ProjectSovScheduleRequest_sovItemId_fkey" FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkOrder" ADD CONSTRAINT "ProjectWorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkOrderAttachment" ADD CONSTRAINT "ProjectWorkOrderAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkOrderRecord" ADD CONSTRAINT "ProjectWorkOrderRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_assignedSovItemId_fkey" FOREIGN KEY ("assignedSovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ProjectScheduleSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_turnoverRequestId_fkey" FOREIGN KEY ("turnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringContract" ADD CONSTRAINT "RecurringContract_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringContract" ADD CONSTRAINT "RecurringContract_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringContractPeriod" ADD CONSTRAINT "RecurringContractPeriod_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringContractUnit" ADD CONSTRAINT "RecurringContractUnit_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCheckWorker" ADD CONSTRAINT "SafetyCheckWorker_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCheckWorker" ADD CONSTRAINT "SafetyCheckWorker_safetyCheckId_fkey" FOREIGN KEY ("safetyCheckId") REFERENCES "DailySafetyCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_safetyCheckId_fkey" FOREIGN KEY ("safetyCheckId") REFERENCES "DailySafetyCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_safetyCheckWorkerId_fkey" FOREIGN KEY ("safetyCheckWorkerId") REFERENCES "SafetyCheckWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBidEntry" ADD CONSTRAINT "SalesBidEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoverRequest" ADD CONSTRAINT "TurnoverRequest_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitChecklistPhoto" ADD CONSTRAINT "UnitChecklistPhoto_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "UnitTurnoverChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitTurnoverChecklist" ADD CONSTRAINT "UnitTurnoverChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractorAssignmentSOVItems" ADD CONSTRAINT "_ContractorAssignmentSOVItems_A_fkey" FOREIGN KEY ("A") REFERENCES "ContractorAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractorAssignmentSOVItems" ADD CONSTRAINT "_ContractorAssignmentSOVItems_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DayAssignmentChangeOrders" ADD CONSTRAINT "_DayAssignmentChangeOrders_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DayAssignmentChangeOrders" ADD CONSTRAINT "_DayAssignmentChangeOrders_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectDayAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DayAssignmentSOVItems" ADD CONSTRAINT "_DayAssignmentSOVItems_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectDayAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DayAssignmentSOVItems" ADD CONSTRAINT "_DayAssignmentSOVItems_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LaborEntrySOVItems" ADD CONSTRAINT "_LaborEntrySOVItems_A_fkey" FOREIGN KEY ("A") REFERENCES "LaborEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LaborEntrySOVItems" ADD CONSTRAINT "_LaborEntrySOVItems_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QualityCheckSOVItems" ADD CONSTRAINT "_QualityCheckSOVItems_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QualityCheckSOVItems" ADD CONSTRAINT "_QualityCheckSOVItems_B_fkey" FOREIGN KEY ("B") REFERENCES "QualityCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;


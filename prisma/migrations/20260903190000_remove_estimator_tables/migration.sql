-- Estimator split-out to piramid.ai / aiestimator-ui, which has its own
-- dedicated database with the same 4 tables already migrated. See the
-- migration plan's Phase 10 (sueep-site cleanup). Backed up to
-- ../sueep-site-estimator-backup/*.json before this ran (2 companies, 5
-- users, 1 settings row, 1 usage event -- unchanged since that migration,
-- nothing new lost here).

-- DropForeignKey
ALTER TABLE "EstimatorUsageEvent" DROP CONSTRAINT "EstimatorUsageEvent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "EstimatorUser" DROP CONSTRAINT "EstimatorUser_companyId_fkey";

-- DropForeignKey
ALTER TABLE "EstimatorUserSettings" DROP CONSTRAINT "EstimatorUserSettings_estimatorUserId_fkey";

-- DropTable
DROP TABLE "Company";

-- DropTable
DROP TABLE "EstimatorUsageEvent";

-- DropTable
DROP TABLE "EstimatorUser";

-- DropTable
DROP TABLE "EstimatorUserSettings";

-- DropEnum
DROP TYPE "EstimatorUserRole";

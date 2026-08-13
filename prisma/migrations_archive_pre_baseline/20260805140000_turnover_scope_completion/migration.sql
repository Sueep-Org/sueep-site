-- AlterTable
ALTER TABLE "TurnoverRequest" ADD COLUMN "completedScopeItems" JSONB NOT NULL DEFAULT '[]';

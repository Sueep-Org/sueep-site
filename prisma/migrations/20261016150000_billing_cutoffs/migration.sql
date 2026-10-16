-- Billing cutoffs: per-job cutoff day override, and the Management calendar category. Additive only.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingCutoffDay" INTEGER;


-- Calendar category (no category reminders: the job's PM gets their own email 5 days before).
INSERT INTO "ManagementCategory" ("id", "updatedAt", "builtinKey", "name", "color", "remindDays", "sortOrder")
VALUES ('mgmtcat_billing_cutoffs', CURRENT_TIMESTAMP, 'BILLING_CUTOFFS', 'Billing cutoffs', 'emerald', ARRAY[]::INTEGER[], 11)
ON CONFLICT ("builtinKey") DO NOTHING;

-- Who can earn sales commission. Off for everyone, then on for Nick Wehr, the only salesperson today.
ALTER TABLE "Employee" ADD COLUMN "commissionEligible" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Employee" SET "commissionEligible" = true WHERE "email" = 'nick@sueep.com';

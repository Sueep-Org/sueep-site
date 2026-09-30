-- Date a janitorial contract month was marked paid (Finance tab "Paid" view).
ALTER TABLE "RecurringContractPeriod" ADD COLUMN "paidAt" TIMESTAMP(3);

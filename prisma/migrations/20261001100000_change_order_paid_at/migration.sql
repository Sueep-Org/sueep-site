-- Date a change order was marked paid (Finance tab "Paid" view).
ALTER TABLE "ProjectChangeOrder" ADD COLUMN "paidAt" TIMESTAMP(3);

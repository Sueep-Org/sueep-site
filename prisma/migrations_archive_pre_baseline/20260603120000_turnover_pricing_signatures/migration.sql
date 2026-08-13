ALTER TABLE "Building" ADD COLUMN "builder" TEXT;
ALTER TABLE "Building" ADD COLUMN "pricingPackage" JSONB;

ALTER TABLE "TurnoverRequest" ADD COLUMN "approvedPriceCents" INTEGER;
ALTER TABLE "TurnoverRequest" ADD COLUMN "pmSignatureUrl" TEXT;
ALTER TABLE "TurnoverRequest" ADD COLUMN "pmSignedAt" TIMESTAMP(3);

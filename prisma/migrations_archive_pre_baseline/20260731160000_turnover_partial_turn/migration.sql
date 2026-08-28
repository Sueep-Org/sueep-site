-- AlterTable
ALTER TABLE "TurnoverRequest" ADD COLUMN     "isPartialTurn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partialTurnLayout" TEXT;

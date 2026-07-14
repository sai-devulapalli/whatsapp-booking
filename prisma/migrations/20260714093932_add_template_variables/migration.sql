-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "variables" TEXT[] DEFAULT ARRAY[]::TEXT[];

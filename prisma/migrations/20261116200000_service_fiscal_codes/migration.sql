-- v2.6: fiscal receipt codes synced from the till (additive).
-- AlterTable
ALTER TABLE "services" ADD COLUMN     "mxik" TEXT,
ADD COLUMN     "package_code" TEXT;

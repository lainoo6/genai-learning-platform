-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isCurated" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: seeded courses were the staff picks before this column existed.
-- Without this every curated badge would disappear on deploy.
UPDATE "Course" SET "isCurated" = true WHERE "source" = 'SEED';

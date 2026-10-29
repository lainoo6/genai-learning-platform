-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "repoBranch" TEXT,
ADD COLUMN     "repoSelectedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "repoUrl" TEXT;

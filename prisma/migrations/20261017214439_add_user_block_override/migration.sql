-- CreateTable
CREATE TABLE "UserBlockOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlockOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBlockOverride_userId_lessonId_blockId_key" ON "UserBlockOverride"("userId", "lessonId", "blockId");

-- AddForeignKey
ALTER TABLE "UserBlockOverride" ADD CONSTRAINT "UserBlockOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

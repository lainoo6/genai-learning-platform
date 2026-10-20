CREATE TABLE "ActivityAttempt" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "blockId" TEXT NOT NULL,
  "blockType" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActivityAttempt_userId_lessonId_blockId_attemptId_key" ON "ActivityAttempt"("userId", "lessonId", "blockId", "attemptId");
CREATE INDEX "ActivityAttempt_userId_lessonId_blockId_createdAt_idx" ON "ActivityAttempt"("userId", "lessonId", "blockId", "createdAt");

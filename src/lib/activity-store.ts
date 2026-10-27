import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Block } from "@/lib/blocks/schema";
import type { ActivityGrade } from "@/lib/blocks/activity-result";

export async function persistActivity(input: {
  userId: string;
  courseId: string;
  lessonId: string;
  block: Block;
  blocks: Block[];
  attemptId: string;
  answer: Record<string, unknown>;
  grade: ActivityGrade;
}) {
  const {
    userId,
    courseId,
    lessonId,
    block,
    blocks,
    attemptId,
    answer,
    grade,
  } = input;
  const result = {
    version: 1,
    attemptId,
    activityType: block.type,
    blockId: block.id,
    lessonId,
    courseId,
    answer,
    ...grade,
    activitySnapshot: block,
  };
  // Serializable + bounded retry prevents parallel blocks overwriting completedBlocks.
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const key = { userId, lessonId, blockId: block.id, attemptId };
          const existing = await tx.activityAttempt.findUnique({
            where: { userId_lessonId_blockId_attemptId: key },
          });
          if (existing) return existing;
          const attempt = await tx.activityAttempt.create({
            data: {
              ...key,
              blockType: block.type,
              result: JSON.parse(
                JSON.stringify(result),
              ) as Prisma.InputJsonValue,
            },
          });
          const progress = await tx.lessonProgress.findUnique({
            where: { userId_lessonId: { userId, lessonId } },
          });
          const completedBlocks = new Set(
            Array.isArray(progress?.completedBlocks)
              ? progress.completedBlocks.filter(
                  (v): v is string => typeof v === "string",
                )
              : [],
          );
          const wasCompleted = completedBlocks.has(block.id);
          if (grade.completed) completedBlocks.add(block.id);
          const allDone = blocks.every((b) => completedBlocks.has(b.id));
          const attempts = await tx.activityAttempt.findMany({
            where: { userId, lessonId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          const scores = new Map<string, number>();
          for (const row of attempts) {
            const r = row.result as { score?: { normalized?: number } | null };
            if (
              !scores.has(row.blockId) &&
              typeof r.score?.normalized === "number" &&
              blocks.some((b) => b.id === row.blockId)
            )
              scores.set(row.blockId, r.score.normalized);
          }
          const score = scores.size
            ? [...scores.values()].reduce((a, b) => a + b, 0) / scores.size
            : (progress?.score ?? null);
          const data = {
            completedBlocks: [...completedBlocks],
            score,
            status: allDone ? ("COMPLETED" as const) : ("IN_PROGRESS" as const),
          };
          await tx.lessonProgress.upsert({
            where: { userId_lessonId: { userId, lessonId } },
            create: { userId, lessonId, ...data },
            update: data,
          });
          const eventType = {
            quiz: "QUIZ_ATTEMPT",
            game: grade.completed ? "GAME_FINISH" : "GAME_ATTEMPT",
            simulation: "SIM_END",
            coding:
              answer.kind === "review" ? "CODING_REVIEW" : "CODING_SUBMIT",
            roleplay: "ROLEPLAY_END",
            reflection: "REFLECTION_SUBMIT",
            reading: "ACTIVITY_SUBMIT",
            flashcards: "ACTIVITY_SUBMIT",
            slides: "ACTIVITY_SUBMIT",
          }[block.type];
          const payload = {
            version: 1,
            attemptId,
            lessonId,
            blockId: block.id,
            activityType: block.type,
            score: grade.score?.normalized ?? null,
            completed: grade.completed,
            passed: grade.passed,
            ...grade.feedback,
          } as Prisma.InputJsonValue;
          await tx.engagementEvent.create({
            data: { userId, courseId, type: eventType, payload },
          });
          if (block.type === "quiz")
            await tx.engagementEvent.create({
              data: { userId, courseId, type: "QUIZ_SUBMIT", payload },
            });
          if (grade.completed && !wasCompleted)
            await tx.engagementEvent.create({
              data: { userId, courseId, type: "BLOCK_COMPLETE", payload },
            });
          if (allDone) {
            const incomplete = await tx.lesson.count({
              where: {
                module: { courseId },
                progress: { none: { userId, status: "COMPLETED" } },
              },
            });
            if (!incomplete)
              await tx.enrollment.updateMany({
                where: { userId, courseId, completedAt: null },
                data: { completedAt: new Date() },
              });
          }
          return attempt;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        retry < 3 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      )
        continue;
      throw error;
    }
  }
}

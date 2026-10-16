"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { blockListSchema } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";

/** Result shape returned to the block components (never throws at the client). */
export type ProgressActionResult = { ok: true } | { ok: false; error: string };

const completeBlockSchema = z.object({
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  /** Quiz score as a ratio in [0, 1]; omitted by unscored blocks. */
  score: z.number().min(0).max(1).optional(),
});

/** Reads the stored `completedBlocks` JSON array, dropping anything malformed. */
function readCompletedBlocks(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Records one completed block for the signed-in learner.
 *
 * Upserts `LessonProgress`: `blockId` is appended once (deduped), the status
 * moves to at least IN_PROGRESS, and `score` is only overwritten by scored
 * blocks (quiz) so a reading block never clears a quiz result.
 */
export async function completeBlock(
  lessonId: string,
  blockId: string,
  score?: number,
): Promise<ProgressActionResult> {
  const parsedInput = completeBlockSchema.safeParse({ lessonId, blockId, score });
  if (!parsedInput.success) {
    return { ok: false, error: "Invalid progress payload." };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: "Sign in to save your progress." };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      blocks: true,
      module: { select: { courseId: true } },
    },
  });

  if (lesson === null) {
    return { ok: false, error: "Lesson not found." };
  }

  const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
  if (
    !parsedBlocks.success
    || !parsedBlocks.data.some((block) => block.id === blockId)
  ) {
    return { ok: false, error: "Unknown block for this lesson." };
  }

  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { status: true, completedBlocks: true },
  });

  const completedBlocks = readCompletedBlocks(existing?.completedBlocks);
  if (!completedBlocks.includes(blockId)) {
    completedBlocks.push(blockId);
  }

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      status: "IN_PROGRESS",
      completedBlocks,
      score: score ?? null,
    },
    update: {
      status: existing?.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      completedBlocks,
      // `undefined` leaves the previous score untouched (Prisma skips it).
      score: score ?? undefined,
    },
  });

  const courseId = lesson.module.courseId;

  if (score === undefined) {
    await trackEvent("BLOCK_COMPLETE", {
      userId,
      courseId,
      payload: { lessonId, blockId },
    });
    return { ok: true };
  }

  await trackEvent("QUIZ_SUBMIT", {
    userId,
    courseId,
    payload: { lessonId, blockId, score },
  });
  await trackEvent("BLOCK_COMPLETE", {
    userId,
    courseId,
    payload: { lessonId, blockId, score },
  });

  return { ok: true };
}

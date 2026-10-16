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
 * Upserts `LessonProgress`: `blockId` is appended once (deduped) and the status
 * moves to at least IN_PROGRESS.
 */
export async function completeBlock(
  lessonId: string,
  blockId: string,
): Promise<ProgressActionResult> {
  const parsedInput = completeBlockSchema.safeParse({ lessonId, blockId });
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
    },
    update: {
      status: existing?.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      completedBlocks,
    },
  });

  await trackEvent("BLOCK_COMPLETE", {
    userId,
    courseId: lesson.module.courseId,
    payload: { lessonId, blockId },
  });

  return { ok: true };
}
